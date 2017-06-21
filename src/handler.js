const _ = require('lodash');
const { HttpStatusError } = require('./errors');
const { parse } = require('./parser');
const { distinct, raw } = require('./transforms');

class ModelHandler {
    constructor(model, defaults = { limit: 50, offset: 0 }) {
        this.model = model;
        this.defaults = defaults;
    }
    
    create() {
        const self = this;
        
        return [
            raw,
            handle
        ];
        
        function handle(req, res, next) {
            self.model
                .create(req.body)
                .then(respond)
                .catch(next);
            
            function respond(row) {
                res.status(201);
                res.send(res.transform(row));
            }
        }
    }
    
    get() {
        const self = this;
        
        return [
            raw,
            handle
        ];
        
        function handle(req, res, next) {
            self
                .findOne(req.params)
                .then(respond)
                .catch(next);
            
            function respond(row) {
                if (!row) {
                    throw new HttpStatusError(404, 'Not Found');
                }
                
                res.send(res.transform(row));
            }
        }
    }
    
    query() {
        const self = this;
        
        return [
            raw,
            handle
        ];
        
        function handle(req, res, next) {
            self
                .findAndCountAll(req.query)
                .then(respond)
                .catch(next);
            
            function respond({ rows, start, end, count }) {
                res.set('Content-Range', `${start}-${end}/${count}`);
                
                if (count > end) {
                    res.status(206);
                } else {
                    res.status(200);
                }
                
                res.send(res.transform(rows));
            }
        }
    }
    
    remove() {
        const self = this;
        
        return [
            handle
        ];
        
        function handle(req, res, next) {
            self
                .findOne(req.params)
                .then(destroy)
                .then(respond)
                .catch(next);
            
            function destroy(row) {
                if (!row) {
                    throw new HttpStatusError(404, 'Not Found');
                }
                
                return row.destroy();
            }
            
            function respond() {
                res.sendStatus(204);
            }
        }
    }
    
    update() {
        const self = this;
        
        return [
            raw,
            handle
        ];
        
        function handle(req, res, next) {
            self
                .findOne(req.params)
                .then(updateAttributes)
                .then(respond)
                .catch(next);
                
            function updateAttributes(row) {
                if (!row) {
                    throw new HttpStatusError(404, 'Not Found');
                }
                
                return row.updateAttributes(req.body);
            }
            
            function respond(row) {
                res.send(res.transform(row));
            }
        }
    }
    
    findOne(params, options) {
        options = _.merge(parse(params, this.model), options);

        return this.model.findOne(options);
    }
    
    findAndCountAll(params, options) {
        let parsed = parse(params, this.model);
        
        options = _(parsed)
            .defaults(this.defaults)
            .merge(options)
            .value();
        
        return this.model
            .findAndCountAll(options)
            .then(extract);
            
        function extract({ count, rows }) {
            const start = options.offset;
            const end = Math.min(count, (options.offset + options.limit) || count);
        
            return { rows, start, end, count };
        }
    }
}

module.exports = ModelHandler;