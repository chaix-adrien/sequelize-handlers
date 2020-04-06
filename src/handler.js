const _ = require("lodash")
const { HttpStatusError } = require("./errors")
const { parse } = require("./parser")
const { raw } = require("./transforms")
const paginate = require("express-paginate")

class ModelHandler {
  constructor(model, defaults = { limit: 50, offset: 0 }) {
    this.model = model
    this.defaults = defaults
  }

  create() {
    const handle = (req, res, next) => {
      this.model
        .create(req.body)
        .then(respond)
        .then(next)
        .catch(next)

      function respond(row) {
        req.obj = row
        res.status(201)
        res.send(res.transform(row))
      }
    }

    return [raw, handle]
  }

  get() {
    const handle = (req, res, next) => {
      this.findOne(req.params, req.options)
        .then(respond)
        .catch(next)

      function respond(row) {
        if (!row) {
          throw res.status(404).json({ errors: "uuid not found", uuid: req.params.uuid })
        }
        if (res.transformAsync)
          res.transformAsync(row).then(transformed => {
            res.send(transformed)
          })
        else res.send(res.transform(row))
      }
    }

    return [raw, handle]
  }

  query() {
    const handle = (req, res, next) => {
      this.findAndCountAll(req.query, req.options, req)
        .then(respond)
        .catch(next)

      function respond({ rows, start, end, count }) {
        res.set("Content-Range", `${start}-${end}/${count}`)

        if (count > end) {
          res.status(206)
        } else {
          res.status(200)
        }
        if (res.transformAsync) {
          res.transformAsync(rows).then(transformed => {
            res.send(transformed)
          })
        } else res.send(res.transform(rows))
      }
    }

    return [raw, handle]
  }

  remove() {
    const handle = (req, res, next) => {
      this.findOne(req.params)
        .then(destroy)
        .then(respond)
        .then(next)
        .catch(next)

      function destroy(row) {
        if (!row) {
          throw res.status(404).json({ errors: "uuid not found", uuid: req.params.uuid })
        }

        return row.destroy()
      }

      function respond() {
        req.obj = req.params
        res.sendStatus(204)
      }
    }

    return [handle]
  }

  update() {
    const handle = (req, res, next) => {
      this.findOne(req.params)
        .then(updateAttributes)
        .then(respond)
        .then(next)
        .catch(next)

      function updateAttributes(row) {
        if (!row) {
          throw res.status(404).json({ errors: "uuid not found", uuid: req.params.uuid })
        }

        return row.update(req.body)
      }

      function respond(row) {
        req.obj = row
        res.send(res.transform(row))
      }
    }

    return [raw, handle]
  }

  findOne(params, options) {
    options = _.merge(parse(params, this.model), options)

    return this.model.findOne(options)
  }

  findAndCountAll(params, options, req) {
    let parsed = parse(params, this.model)

    options = { ...options, ...parsed, ...this.defaults, where: options ? { ...options.where } : undefined }
    if (!isNaN(params.limit)) options.distinct = true
    if (!isNaN(params.limit)) options.limit = params.limit
    if (!isNaN(params.limit)) options.offset = (params.page - 1) * params.limit
    return this.model.findAndCountAll(options).then(extract)
    function extract({ count, rows }) {
      const itemCount = count
      const pageCount = Math.ceil(count / req.query.limit)
      if (isNaN(params.limit)) return { rows }
      return {
        rows: {
          data: rows,
          pageTotal: pageCount,
          itemTotal: itemCount,
          currentPage: req.query.page,
          hasPrevious: paginate.hasPreviousPages,
          hasNext: paginate.hasNextPages(req)(pageCount),
          pages: paginate.getArrayPages(req)(3, pageCount, req.query.page),
        },
        start: 0,
        end: itemCount,
        count: count,
      }
    }
  }
}

module.exports = ModelHandler
