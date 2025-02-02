const _ = require('lodash')
const util = require('util')

module.exports = class EntityValuesAsserter {
  constructor (context, caps = {}) {
    this.context = context
    this.caps = caps
  }

  assertConvoStep ({ convo, convoStep, args, botMsg }) {
    let acceptMoreEntities = false
    if (args.length > 0 && ((args[args.length - 1] === '..') || (args[args.length - 1] === '...'))) {
      acceptMoreEntities = true
      args = args.slice(0, args.length - 1)
    }

    const expectedEntities = _extractCount(args)

    const currentEntities = _.has(botMsg, 'nlp.entities') ? _extractCount(botMsg.nlp.entities.map((entity) => entity.value)) : {}

    const { substracted, hasMissingEntity } = _substract(currentEntities, expectedEntities)

    if (Object.keys(substracted).length === 0 || (acceptMoreEntities && !hasMissingEntity)) {
      return Promise.resolve()
    }

    const substractedAsArray = []
    Object.keys(substracted).forEach((key) => substractedAsArray.push({ entity: key, diff: substracted[key] }))
    substractedAsArray.sort(
      (o1, o2) => {
        if (o1.entity < o2.entity) { return -1 }
        if (o1.entity > o2.entity) { return 1 }
        return 0
      }
    )
    return Promise.reject(new Error(`${convoStep.stepTag}: Wrong number of entity values. The difference is ${util.inspect(substractedAsArray)}`))
  }
}

const _extractCount = (toCount) => {
  const result = {}
  toCount.forEach((item) => {
    if (result[item]) {
      result[item] += result[item]
    } else {
      result[item] = 1
    }
  })

  return result
}

const _substract = (first, second) => {
  const substracted = {}
  let hasMissingEntity = false

  for (let key in first) {
    if (second[key]) {
      if (first[key] - second[key] !== 0) {
        substracted[key] = first[key] - second[key]
        if (substracted[key] < 0) {
          hasMissingEntity = true
        }
      }
    } else {
      substracted[key] = first[key]
    }
  }

  for (let key in second) {
    if (!first[key]) {
      substracted[key] = -second[key]
      hasMissingEntity = true
    }
  }

  return { substracted, hasMissingEntity }
}
