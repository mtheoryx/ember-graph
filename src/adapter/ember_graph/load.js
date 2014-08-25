var Promise = Em.RSVP.Promise;

var map = Em.ArrayPolyfills.map;
var filter = Em.ArrayPolyfills.filter;
var forEach = Em.ArrayPolyfills.forEach;
var typeOf = Em.typeOf;

EG.EmberGraphAdapter.reopen({

	/**
	 * Determines whether or not to bootstrap the database
	 * with an initial set of data. If you want to initialize
	 * the database with data, you should override this property
	 * to return `true`. Use a computed property if deciding to
	 * initialize requires application logic.
	 *
	 * @method shouldBootstrapDatabase
	 * @return {Boolean}
	 * @protected
	 * @for EmberGraphAdapter
	 */
	shouldInitializeDatabase: function() {
		return false;
	},

	/**
	 * If {{link-to-method 'EmberGraphAdapter' 'shouldInitializeDatabase'}} returns `true`,
	 * then this hook is called to get the data to inject into the database. You should
	 * return your initial data payload from this hook. The format of the payload is
	 * very similar to the format required by {{link-to-method 'Store' 'pushPayload'}}.
	 * But there are a few differences for the sake of terseness:
	 *
	 * - IDs can be numbers or strings, they'll be converted to strings automatically
	 * - Relationships can be just IDs or ID objects (the later for polymorphic relationships).
	 *   For example, you may use `{ id: 1, posts: [1] }` instead of `{ id: 1, posts: [{ type: 'post', id: 1 }] }`
	 * - Optional values can be left out, they'll be filled in automatically
	 *
	 * @method getInitialPayload
	 * @return {Object}
	 * @protected
	 * @for EmberGraphAdapter
	 */
	getInitialPayload: function() {
		return { records: {}, relationships: [] };
	},

	/**
	 * Initializes the database (if configured to do so). Verifies all of the data first.
	 * Because saving data to the database can be asynchronous, this function returns
	 * a promise. Your application is probably not ready to be started until this
	 * promise resolves. If your implementation of this class saves the database
	 * synchronously, this can be done during initialization. Otherwise, you'll
	 * have to figure out a way to stall your application until it completes.
	 *
	 * @method initializeDatabase
	 * @return {Promise}
	 * @for EmberGraphAdapter
	 */
	initializeDatabase: function() {
		if (!this.shouldInitializeDatabase()) {
			return Promise.resolve();
		}

		var payload = this.getInitialPayload();

		try {
			var db = this.convertAndVerifyPayload(Em.copy(payload, true));
			return this.setDatabase(db);
		} catch (error) {
			console.error('There was an error while trying to initialize your database.');
			return Promise.reject(error);
		}
	},

	/**
	 * @method convertAndVerifyPayload
	 * @param {Object} payload
	 * @return {JSON} Database object
	 * @private
	 * @for EmberGraphAdapter
	 */
	convertAndVerifyPayload: function(payload) {
		var database = {
			records: this.extractRecords(payload),
			relationships: this.extractRelationships(payload)
		};

		this.validateDatabase(database);

		return database;
	},

	/**
	 * @method extractRecords
	 * @param {Object} payload
	 * @return {JSON} `records` object for database
	 * @private
	 * @for EmberGraphAdapter
	 */
	extractRecords: function(payload) {
		var store = this.get('store');
		var databaseRecords = {};

		EG.values(payload, function(typeKey, records) {
			databaseRecords[typeKey] = {};

			var model = store.modelForType(typeKey);

			forEach.call(records, function(record) {
				databaseRecords[typeKey][record.id] = this.convertRecord(model, record);
			}, this);
		}, this);

		return databaseRecords;
	},

	/**
	 * Takes a single record, fills in missing attributes
	 * and serializes it for storage in the database.
	 *
	 * @method convertRecord
	 * @param {Class} model
	 * @param {Object} record
	 * @return {JSON}
	 * @private
	 * @for EmberGraphAdapter
	 */
	convertRecord: function(model, record) {
		var json = {};

		model.eachAttribute(function(name, meta) {
			var type = this.get('store').attributeTypeFor(meta.type);

			if (record[name] === undefined) {
				if (meta.isRequired) {
					throw new Em.Error(Em.get(model, 'typeKey') + ':' + record.id + ' is missing `' + name + '`');
				} else {
					json[name] = type.serialize(meta.defaultValue);
				}
			} else {
				json[name] = type.serialize(record[name]);
			}
		}, this);

		return json;
	},

	/**
	 * @method extractRelationships
	 * @param {Object} payload
	 * @return {JSON[]}
	 * @private
	 * @for EmberGraphAdapter
	 */
	extractRelationships: function(payload) {
		var store = this.get('store');
		var relationships = [];
		var createdRelationships = new Em.Set();

		function addRelationship(r) {
			var one = r.t1 + ':' + r.i1 + ':' + r.n1;
			var two = r.t2 + ':' + r.i2 + ':' + r.n2;
			var sorted = (one < two ? one + '::' + two : two  + '::' + one);

			if (!createdRelationships.contains(sorted)) {
				createdRelationships.addObject(sorted);
				relationships.push(r);
			}
		}

		EG.values(payload, function(typeKey, records) {
			var model = store.modelForType(typeKey);

			forEach.call(records, function(record) {
				var recordRelationships = this.extractRelationshipsFromRecord(model, record);
				forEach.call(recordRelationships, addRelationship);
			}, this);
		}, this);

		return relationships;
	},

	extractRelationshipsFromRecord: function(model, record) {
		var relationships = [];
		var typeKey = Em.get(model, 'typeKey');

		model.eachRelationship(function(name, meta) {
			var value = record[name];

			if (value === undefined) {
				if (meta.isRequired) {
					throw new Em.Error(typeKey + ':' + record.id + ' is missing `' + name + '`');
				} else {
					value = meta.defaultValue;
				}
			}

			if (meta.kind === EG.Model.HAS_ONE_KEY) {
				if (value !== null) {
					if (typeOf(value) === 'string' || typeOf(value) === 'number') {
						value = { type: meta.relatedType, id: value + '' };
					}

					relationships.push({
						t1: typeKey, i1: record.id + '', n1: name,
						t2: value.type, i2: value.id + '', n2: meta.inverse
					});
				}
			} else {
				forEach.call(value, function(other) {
					if (typeOf(other) === 'string' || typeOf(other) === 'number') {
						other = { type: meta.relatedType, id: other + '' };
					}

					relationships.push({
						t1: typeKey, i1: record.id + '', n1: name,
						t2: other.type, i2: other.id + '', n2: meta.inverse
					});
				});
			}
		});

		return relationships;
	},

	/**
	 * @method validateDatabase
	 * @param {JSON} db
	 * @private
	 * @for EmberGraphAdapter
	 */
	validateDatabase: function(db) {
		function filterRelationships(typeKey, id, name) {
			return filter.call(db.relationships, function(r) {
				return ((r.t1 === typeKey && r.i1 === id && r.n1 === name) ||
					(r.t2 === typeKey && r.i2 === id && r.n2 === name));
			});
		}

		function relationshipToString(r) {
			var one = r.t1 + ':' + r.i1 + ':' + r.n1;
			var two = r.t2 + ':' + r.i2 + ':' + r.n2;
			return (one < two ? one + '::' + two : two  + '::' + one);
		}

		var relationshipSet = new Em.Set(map.call(db.relationships, relationshipToString));
		if (Em.get(relationshipSet, 'length') !== db.relationships.length) {
			throw new Em.Error('An invalid set of relationships was generated.');
		}

		forEach.call(db.relationships, function(relationship) {
			if (!db.records[relationship.t1][relationship.i1]) {
				throw new Em.Error(relationship.t1 + ':' + relationship.i1 + ' doesn\'t exist');
			}

			if (!db.records[relationship.t2][relationship.i2]) {
				throw new Em.Error(relationship.t2 + ':' + relationship.i2 + ' doesn\'t exist');
			}
		});

		EG.values(db.records, function(typeKey, records) {
			var model = this.get('store').modelForType(typeKey);

			model.eachRelationship(function(name, meta) {
				if (meta.kind !== EG.Model.HAS_ONE_KEY) {
					return;
				}

				EG.values(records, function(id, record) {
					var relationships = filterRelationships(typeKey, id, name);

					if (relationships.length > 1) {
						throw new Error('Too many relationships connected to ' + typeKey + ':' + id + ':' + name);
					}
				});
			});
		}, this);
	}

});