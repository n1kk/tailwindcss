import _ from 'lodash'
import postcss from 'postcss'
import Node from 'postcss/lib/node'
import isFunction from 'lodash/isFunction'
import escapeClassName from '../util/escapeClassName'
import generateVariantFunction from '../util/generateVariantFunction'
import parseObjectStyles from '../util/parseObjectStyles'
import prefixSelector from '../util/prefixSelector'
import wrapWithVariants from '../util/wrapWithVariants'
import increaseSpecificity from '../util/increaseSpecificity'

function parseStyles(styles) {
  if (!Array.isArray(styles)) {
    return parseStyles([styles])
  }

  return _.flatMap(styles, style => (style instanceof Node ? style : parseObjectStyles(style)))
}

export default function(plugins, config) {
  const pluginBaseStyles = []
  const pluginComponents = []
  const pluginUtilities = []
  const pluginFunctions = []
  const pluginVariantGenerators = {}

  const applyConfiguredPrefix = selector => {
    return prefixSelector(config.prefix, selector)
  }
  const getConfigValue = (path, defaultValue) => _.get(config, path, defaultValue)

  plugins.forEach(plugin => {
    const handler = isFunction(plugin) ? plugin : _.get(plugin, 'handler', () => {})

    handler({
      postcss,
      config: getConfigValue,
      theme: (path, defaultValue) => {
        let value = getConfigValue(`theme.${path}`, defaultValue)

        if (value && value.hasOwnProperty('default')) {
          return value.default
        } else {
          return value
        }
      },
      variants: (path, defaultValue) => {
        if (Array.isArray(config.variants)) {
          return config.variants
        }

        return getConfigValue(`variants.${path}`, defaultValue)
      },
      e: escapeClassName,
      prefix: applyConfiguredPrefix,
      addUtilities: (utilities, options) => {
        const defaultOptions = { variants: [], respectPrefix: true, respectImportant: true }

        options = Array.isArray(options)
          ? Object.assign({}, defaultOptions, { variants: options })
          : _.defaults(options, defaultOptions)

        const styles = postcss.root({ nodes: parseStyles(utilities) })

        styles.walkRules(rule => {
          if (options.respectPrefix) {
            rule.selector = applyConfiguredPrefix(rule.selector)
          }

          if (options.respectImportant && _.get(config, 'important')) {
            if (config.important === true) {
              rule.walkDecls(decl => (decl.important = true))
            } else if (typeof config.important === 'string') {
              rule.selectors = rule.selectors.map(selector => {
                return increaseSpecificity(config.important, selector)
              })
            }
          }
        })

        pluginUtilities.push(wrapWithVariants(styles.nodes, options.variants))
      },
      addComponents: (components, options) => {
        options = Object.assign({ respectPrefix: true }, options)

        const styles = postcss.root({ nodes: parseStyles(components) })

        styles.walkRules(rule => {
          if (options.respectPrefix) {
            rule.selector = applyConfiguredPrefix(rule.selector)
          }
        })

        pluginComponents.push(...styles.nodes)
      },
      addBase: baseStyles => {
        pluginBaseStyles.push(...parseStyles(baseStyles))
      },
      addVariant: (name, generator) => {
        pluginVariantGenerators[name] = generateVariantFunction(generator)
      },
      addFunction: (name, executor) => {
        pluginFunctions[name] = executor
      },
    })
  })

  return {
    base: pluginBaseStyles,
    components: pluginComponents,
    utilities: pluginUtilities,
    variantGenerators: pluginVariantGenerators,
    postcssFunctions: pluginFunctions,
  }
}
