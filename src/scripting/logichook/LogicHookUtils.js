const util = require('util')
const vm = require('vm')
const path = require('path')
const isClass = require('is-class')
const debug = require('debug')('botium-asserterUtils')

const { LOGIC_HOOK_INCLUDE } = require('./LogicHookConsts')

const DEFAULT_ASSERTERS = [
  { name: 'BUTTONS', className: 'ButtonsAsserter' },
  { name: 'MEDIA', className: 'MediaAsserter' },
  { name: 'PAUSE_ASSERTER', className: 'PauseAsserter' },
  { name: 'ENTITIES', className: 'EntitiesAsserter' },
  { name: 'ENTITY_VALUES', className: 'EntityValuesAsserter' },
  { name: 'INTENT', className: 'IntentAsserter' },
  { name: 'INTENT_CONFIDENCE', className: 'IntentConfidenceAsserter' }
]
DEFAULT_ASSERTERS.forEach((asserter) => {
  asserter.Class = require(`./asserter/${asserter.className}`)
})

const DEFAULT_LOGIC_HOOKS = [
  { name: 'PAUSE', className: 'PauseLogicHook' },
  { name: 'WAITFORBOT', className: 'WaitForBotLogicHook' },
  { name: 'SET_SCRIPTING_MEMORY', className: 'SetScriptingMemoryLogicHook' },
  { name: 'CLEAR_SCRIPTING_MEMORY', className: 'ClearScriptingMemoryLogicHook' },
  { name: LOGIC_HOOK_INCLUDE, className: 'IncludeLogicHook' }
]

DEFAULT_LOGIC_HOOKS.forEach((logicHook) => {
  logicHook.Class = require(`./logichooks/${logicHook.className}`)
})

const DEFAULT_USER_INPUTS = [
  { name: 'BUTTON', className: 'ButtonInput' },
  { name: 'MEDIA', className: 'MediaInput' },
  { name: 'FORM', className: 'FormInput' }
]

DEFAULT_USER_INPUTS.forEach((userInput) => {
  userInput.Class = require(`./userinput/${userInput.className}`)
})

const Capabilities = require('../../Capabilities')
const _ = require('lodash')

module.exports = class LogicHookUtils {
  constructor ({ buildScriptContext, caps }) {
    this.asserters = {}
    this.globalAsserters = []
    this.logicHooks = {}
    this.globalLogicHooks = []
    this.userInputs = {}
    this.buildScriptContext = buildScriptContext
    this.caps = caps
    this._setDefaultAsserters()
    this._setDefaultLogicHooks()
    this._setDefaultUserInputs()
    this._fetchAsserters()
    this._fetchLogicHooks()
    this._fetchUserInputs()
  }

  _setDefaultAsserters () {
    DEFAULT_ASSERTERS.forEach((asserter) => {
      this.asserters[asserter.name] = new (asserter.Class)(this.buildScriptContext, this.caps)
    })

    debug(`Loaded Default asserter - ${util.inspect(Object.keys(this.asserters))}`)
  }

  _setDefaultLogicHooks () {
    DEFAULT_LOGIC_HOOKS.forEach((lh) => {
      this.logicHooks[lh.name] = new (lh.Class)(this.buildScriptContext, this.caps)
    })
    debug(`Loaded Default logic hook - ${util.inspect(Object.keys(this.logicHooks))}`)
  }

  _setDefaultUserInputs () {
    DEFAULT_USER_INPUTS.forEach((ui) => {
      this.userInputs[ui.name] = new (ui.Class)(this.buildScriptContext, this.caps)
    })
    debug(`Loaded Default user input - ${util.inspect(Object.keys(this.userInputs))}`)
  }

  _fetchAsserters () {
    this.caps[Capabilities.ASSERTERS]
      .map(asserter => {
        if (this.asserters[asserter.ref]) {
          debug(`${asserter.ref} asserter already exists, overwriting.`)
        }
        this.asserters[asserter.ref] = this._loadClass(asserter, 'asserter')
        if (asserter.global) {
          this.globalAsserters.push(asserter.ref)
          debug(`global asserter: ${asserter.ref} was set and will be executed in every convo`)
        }
      })
  }

  _fetchLogicHooks () {
    this.caps[Capabilities.LOGIC_HOOKS]
      .map(logicHook => {
        if (this.logicHooks[logicHook.ref]) {
          debug(`${logicHook.ref} logic hook already exists, overwriting.`)
        }
        this.logicHooks[logicHook.ref] = this._loadClass(logicHook, 'logic-hook')
        debug(`Loaded ${logicHook.ref} SUCCESSFULLY`)
        if (logicHook.global) {
          this.globalLogicHooks.push(logicHook.ref)
          debug(`global logic hook: ${logicHook.ref} was set and will be executed in every convo`)
        }
      })
  }

  _fetchUserInputs () {
    this.caps[Capabilities.USER_INPUTS]
      .map(userInput => {
        if (this.userInputs[userInput.ref]) {
          debug(`${userInput.ref} userinput already exists, overwriting.`)
        }
        this.userInputs[userInput.ref] = this._loadClass(userInput, 'user-input')
        debug(`Loaded ${userInput.ref} SUCCESSFULLY`)
      })
  }

  getGlobalAsserter () {
    return this.globalAsserters
      .map(name => this.asserters[name])
  }

  getGlobalLogicHook () {
    return this.globalLogicHooks
      .map(name => this.logicHooks[name])
  }

  _loadClass ({ src, ref, args }, hookType) {
    if (hookType !== 'asserter' && hookType !== 'logic-hook' && hookType !== 'user-input') {
      throw Error(`Unknown hookType ${hookType}`)
    }

    // 1 gives possibility to use default asserter as global asserter
    if (hookType === 'asserter') {
      const asserter = DEFAULT_ASSERTERS.find(asserter => src === asserter.className)
      if (asserter) {
        debug(`Loading ${ref} ${hookType}. Using default asserter ${asserter.className} as global asserter`)
        return new (asserter.Class)(this.buildScriptContext, this.caps, args)
      }
    }
    if (hookType === 'logic-hook') {
      const lh = DEFAULT_LOGIC_HOOKS.find(lh => src === lh.className)
      if (lh) {
        debug(`Loading ${ref} ${hookType}. Using default logic-hook ${lh.className} as global logic-hook`)
        return new (lh.Class)(this.buildScriptContext, this.caps, args)
      }
    }
    if (hookType === 'user-input') {
      const ui = DEFAULT_USER_INPUTS.find(ui => src === ui.className)
      if (ui) {
        debug(`Loading ${ref} ${hookType}. Using default user-input ${ui.className} as global user-input`)
        return new (ui.Class)(this.buildScriptContext, this.caps, args)
      }
    }
    if (!src) {
      let packageName = `botium-${hookType}-${ref}`
      try {
        const CheckClass = require(packageName)
        if (isClass(CheckClass)) {
          debug(`Loading ${ref} ${hookType}. Loading from ${packageName} as class. Guessed package name.`)
          return new CheckClass(this.buildScriptContext, this.caps, args)
        } else if (_.isFunction(CheckClass)) {
          debug(`Loading ${ref} ${hookType}. Loading from ${packageName} as function. Guessed package name.`)
          return CheckClass(this.buildScriptContext, this.caps, args)
        } else {
          throw new Error(`${packageName} class or function expected`)
        }
      } catch (err) {
        throw new Error(`Failed to fetch package ${packageName} - ${util.inspect(err)}`)
      }
    }
    if (isClass(src)) {
      try {
        const CheckClass = src
        debug(`Loading ${ref} ${hookType}. Using src as class.`)
        return new CheckClass(this.buildScriptContext, this.caps, args)
      } catch (err) {
        throw new Error(`Failed to load package ${ref} from provided class - ${util.inspect(err)}`)
      }
    }
    if (_.isFunction(src)) {
      try {
        debug(`Loading ${ref} ${hookType}. Using src as function.`)
        return src(this.buildScriptContext, this.caps, args)
      } catch (err) {
        throw new Error(`Failed to load package ${ref} from provided function - ${util.inspect(err)}`)
      }
    }
    if (_.isObject(src) && !_.isString(src)) {
      try {
        const hookObject = Object.keys(src).reduce((result, key) => {
          result[key] = (args) => {
            const script = src[key]
            try {
              const sandbox = vm.createContext({ debug, console, ...args })
              vm.runInContext(script, sandbox)
              return sandbox.result || Promise.resolve()
            } catch (err) {
              throw new Error(`Script "${key}" is not valid - ${util.inspect(err)}`)
            }
          }
          return result
        }, {})
        debug(`Loading ${ref} ${hookType}. Using src as function code.`)
        return hookObject
      } catch (err) {
        throw new Error(`Failed to load package ${ref} from provided function - ${util.inspect(err)}`)
      }
    }

    const loadErr = []

    const tryLoadPackage = src
    try {
      let CheckClass = require(tryLoadPackage)
      if (CheckClass.default) {
        CheckClass = CheckClass.default
      }
      if (isClass(CheckClass)) {
        debug(`Loading ${ref} ${hookType}. Using src for require. Loading from ${tryLoadPackage} as class`)
        return new CheckClass(this.buildScriptContext, this.caps, args)
      } else if (_.isFunction(CheckClass)) {
        debug(`Loading ${ref} ${hookType}. Using src for require. Loading from ${tryLoadPackage} as class`)
        return CheckClass(this.buildScriptContext, this.caps, args)
      } else {
        throw new Error(`${tryLoadPackage} class or function expected`)
      }
    } catch (err) {
      loadErr.push(`Failed to fetch ${ref} ${hookType} from ${tryLoadPackage} - ${util.inspect(err)}`)
    }

    const tryLoadFile = path.resolve(process.cwd(), src)
    try {
      let CheckClass = require(tryLoadFile)
      if (CheckClass.default) {
        CheckClass = CheckClass.default
      }
      if (isClass(CheckClass)) {
        debug(`Loading ${ref} ${hookType}. Using src as relative path to module with a class. Loading from ${tryLoadFile} as class`)
        return new CheckClass(this.buildScriptContext, this.caps, args)
      } else if (_.isFunction(CheckClass)) {
        debug(`Loading ${ref} ${hookType}. Using src as relative path to module with a function. Loading from ${tryLoadFile} as class`)
        return CheckClass(this.buildScriptContext, this.caps, args)
      } else {
        throw new Error(`${tryLoadFile} class or function expected`)
      }
    } catch (err) {
      loadErr.push(`Failed to fetch ${ref} ${hookType} from ${tryLoadFile} - ${util.inspect(err)} `)
    }
    loadErr.forEach(debug)
    throw new Error(`Failed to fetch ${ref} ${hookType}, no idea how to load ...`)
  }
}
