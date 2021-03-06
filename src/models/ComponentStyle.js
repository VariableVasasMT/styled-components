// @flow
import hashStr from '../vendor/glamor/hash'

import type { RuleSet, NameGenerator, Flattener, Stringifier } from '../types'
import StyleSheet from './StyleSheet'
import { IS_BROWSER } from '../constants'
import isStyledComponent from '../utils/isStyledComponent'

const areStylesCacheable = IS_BROWSER

const isStaticRules = (rules: RuleSet, attrs?: Object): boolean => {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i]

    // recursive case
    if (Array.isArray(rule) && !isStaticRules(rule)) {
      return false
    } else if (typeof rule === 'function' && !isStyledComponent(rule)) {
      // functions are allowed to be static if they're just being
      // used to get the classname of a nested styled copmonent
      return false
    }
  }

  if (attrs !== undefined) {
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const key in attrs) {
      const value = attrs[key]
      if (typeof value === 'function') {
        return false
      }
    }
  }

  return true
}

const isHRMEnabled =
  typeof module !== 'undefined' &&
  module.hot &&
  process.env.NODE_ENV !== 'production'

/*
 ComponentStyle is all the CSS-specific stuff, not
 the React-specific stuff.
 */
export default (
  nameGenerator: NameGenerator,
  flatten: Flattener,
  stringifyRules: Stringifier
) => {
  class ComponentStyle {
    rules: RuleSet
    componentId: string
    isStatic: boolean
    lastClassName: ?string

    constructor(rules: RuleSet, attrs?: Object, componentId: string) {
      this.rules = rules
      this.isStatic = !isHRMEnabled && isStaticRules(rules, attrs)
      this.componentId = componentId

      if (!StyleSheet.master.hasInjectedComponent(componentId)) {
        const placeholder =
          process.env.NODE_ENV !== 'production' ? [`.${componentId} {}`] : []
        StyleSheet.master.deferredInject(componentId, placeholder)
      }
    }

    /*
     * Flattens a rule set into valid CSS
     * Hashes it, wraps the whole chunk in a .hash1234 {}
     * Returns the hash to be injected on render()
     * */
    generateAndInjectStyles(executionContext: Object, styleSheet: StyleSheet) {
      const { isStatic, lastClassName } = this
      if (isStatic && lastClassName !== undefined) {
        return lastClassName
      }

      const flatCSS = flatten(this.rules, executionContext)
      const hash = hashStr(this.componentId + flatCSS.join(''))
      const existingName = styleSheet.getNameForHash(hash)

      if (existingName !== undefined) {
        if (areStylesCacheable) {
          this.lastClassName = existingName
        }

        return existingName
      }

      const name = nameGenerator(hash)
      if (areStylesCacheable) {
        this.lastClassName = existingName
      }

      if (styleSheet.alreadyInjected(hash, name)) {
        return name
      }

      const css = stringifyRules(flatCSS, `.${name}`)
      // NOTE: this can only be set when we inject the class-name.
      // For some reason, presumably due to how css is stringifyRules behaves in
      // differently between client and server, styles break.
      styleSheet.inject(this.componentId, css, hash, name)
      return name
    }

    static generateName(str: string) {
      return nameGenerator(hashStr(str))
    }
  }

  return ComponentStyle
}
