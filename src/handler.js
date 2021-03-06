const _ = require("lodash")
const { parse } = require("./parser")
const { raw } = require("./transforms")
const paginate = require("express-paginate")

const getError = (e) =>  (e.parent ? e.parent.sqlMessage : e.errors)

class ModelHandler {
  constructor(model, defaults = { limit: 50, offset: 0 }) {
    this.model = model
    this.defaults = defaults
  }

  create() {
    const handle = async (req, res, next) => {
      {
        try {
          var obj = await this.model.create(req.body)
          obj = await (res.transformAsync ? res.transformAsync(obj, req.body) : Promise.resolve(obj))
          await respond(obj)
          return next()
        } catch (e) {
          return res.status(400).json({error: getError(e)})
        }
      }
      function respond(row) {
        req.obj = row
        res.status(201)
        res.send(res.transform(row))
      }
    }

    return [raw, handle]
  }

  get() {
    const handle = async (req, res, next) => {
      try {
        var obj = await this.findOne(req.params, req.options)
        obj = await (res.transformAsync ? res.transformAsync(obj) : Promise.resolve(obj))
        await respond(obj)
        return next()
      } catch (e) {
        return res.status(e.code || 400).json({error: getError(e)})
      }
      function respond(row) {
        if (!row) throw { code: 404, errors: "id not found", id: req.params.id }
        return res.send(res.transform(row))
      }
    }

    return [raw, handle]
  }

  query() {
    const handle = (req, res, next) => {
      this.findAndCountAll(req.query, req.options, req).then(respond).catch(next)

      function respond({ rows, start, end, count }) {
        res.set("Content-Range", `${start}-${end}/${count}`)

        if (count > end) {
          res.status(206)
        } else {
          res.status(200)
        }
        if (res.transformAsync) {
          res.transformAsync(rows).then((transformed) => {
            res.send(transformed)
          })
        } else res.send(res.transform(rows))
      }
    }

    return [raw, handle]
  }

  remove() {
    const handle = (req, res, next) => {
      this.findOne(req.params).then(destroy).then(respond).then(next).catch(next)

      function destroy(row) {
        if (!row) {
          return res.status(404).json({ errors: "id not found", id: req.params.id })
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
    const handle = async (req, res, next) => {
      try {
        var obj = await this.findOne(req.params, req.options)
        obj = await updateAttributes(obj)
        obj = await (res.transformAsync ? res.transformAsync(obj, req.body) : Promise.resolve(obj))
        await respond(obj)
        return next()
      } catch (e) {
        return res.status(e.code || 400).json({error: getError(e)})
      }

      function updateAttributes(row) {
        if (!row) throw{ code: 404, errors: "id not found", id: req.params.id }
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
