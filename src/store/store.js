import Ember from 'ember';
import RecordCache from 'ember-graph/store/record_cache';
import RecordRequestCache from 'ember-graph/store/record_request_cache';
import LookupMethods from 'ember-graph/store/lookup';
import RelationshipMethods from 'ember-graph/store/relationship';

import {
	PromiseArray,
	ModelPromiseObject
} from 'ember-graph/data/promise_object';
import { deprecateMethod } from 'ember-graph/util/util';

const Promise = Ember.RSVP.Promise;

/**
 * The store is used to manage all records in the application.
 * Ideally, there should only be one store for an application.
 *
 * @class Store
 * @constructor
 */
var Store = (Ember.Service || Ember.Object).extend({

	/**
	 * The number of milliseconds after a record in the cache expires
	 * and must be re-fetched from the server. Leave at Infinity for
	 * now, as finite timeouts will likely cause a lot of bugs.
	 *
	 * @property cacheTimeout
	 * @type Number
	 * @default Infinity
	 */
	cacheTimeout: Infinity,

	/**
	 * A boolean for whether or not to reload dirty records. If this is
	 * true, data from the server will be merged with the data on the
	 * client according to the other options defined on this class.
	 * If it's false, calling reload on a dirty record will throw an
	 * error, and any side loaded data from the server will be discarded.
	 *
	 * Note: If this is turned off, no relationship can be reloaded if
	 * either of the records is dirty. So if the server says that
	 * record 1 is connected to record 2, and you reload record 1, which
	 * is clean, Ember-Graph will abort the reload if record 2 is dirty.
	 * This is a particularly annoying corner case that can be mostly
	 * avoided in two ways: either enable reloadDirty, or ensure that
	 * records are changed and then saved or rollback back in the same
	 * 'action'. (Don't let users perform different modifications at
	 * the same time.)
	 *
	 * @property reloadDirty
	 * @for Store
	 * @type Boolean
	 * @final
	 */
	reloadDirty: true,

	/**
	 * If reloadDirty is true, this determines which side the store will
	 * settle conflicts for. If true, new client side relationships always
	 * take precedence over server side relationships loaded when the
	 * record is dirty. If false, server side relationships will overwrite
	 * any temporary client side relationships on reload.
	 *
	 * Note: This only affects relationships. Attributes aren't as tricky,
	 * so the server data can be loaded without affecting the client data.
	 * To have the server overwrite client data, use the option below.
	 *
	 * @property sideWithClientOnConflict
	 * @for Store
	 * @type Boolean
	 * @final
	 */
	sideWithClientOnConflict: true,

	/**
	 * If reloadDirty is true, this will overwrite client attributes on
	 * reload. Because of the more simplistic nature of attributes, it is
	 * recommended to keep this false. The server data will still be loaded
	 * into the record and can be activated at any time by rolling back
	 * attribute changes on the record.
	 *
	 * @property overwriteClientAttributes
	 * @for Store
	 * @type Boolean
	 * @final
	 */
	overwriteClientAttributes: false,

	/**
	 * Contains the records cached in the store. The keys are type names,
	 * and the values are nested objects keyed at the ID of the record.
	 *
	 * @property recordCache
	 * @type {RecordCache}
	 * @final
	 * @private
	 */
	recordCache: {},

	/**
	 * Contains currently pending requests for records.
	 * This allows us to chain duplicated requests.
	 *
	 * @property recordRequestCache
	 * @type {RecordRequestCache}
	 * @final
	 * @private
	 */
	recordRequestCache: {},

	initializeCaches: Ember.on('init', function() {
		this.setProperties({
			recordCache: RecordCache.create({ cacheTimeout: this.get('cacheTimeout') }),
			recordRequestCache: RecordRequestCache.create()
		});
	}),

	/**
	 * Creates a record of the specified type. The record starts in a blank
	 * state, meaning all attributes are `undefined`, all hasOne relationships
	 * are `null` and all hasMany relationships are `[]`. But before the record
	 * can be saved to the server, all relationships and attributes must be
	 * initialized (except for `serverOnly` ones). Even optional attributes
	 * and relationships must have their values filled in explicitly.
	 *
	 * @method createRecord
	 * @param {String} typeKey
	 * @param {Object} json
	 * @return {Model}
	 */
	createRecord(typeKey, json = {}) {
		const record = this.modelFor(typeKey).create(this);
		this.get('recordCache').storeRecord(record);
		record.initializeRecord(json);
		return record;
	},

	/**
	 * Returns all records of the given type that are in the cache.
	 *
	 * @method cachedRecordsFor
	 * @param {String} typeKey
	 * @return {Model[]}
	 */
	cachedRecordsFor(typeKey) {
		return this.get('recordCache').getRecords(typeKey);
	},

	/**
	 * Returns the record directly if the record is cached in the store.
	 * Otherwise returns `null`.
	 *
	 * @method getRecord
	 * @param {String} typeKey
	 * @param {String} id
	 * @return {Model}
	 */
	getRecord(typeKey, id) {
		return this.get('recordCache').getRecord(typeKey, id);
	},

	/**
	 * Returns an array containing all of the cached records for the
	 * given type. The array will be updated as more records of the
	 * type are cached. This will contain _all_ records of that type,
	 * new and saved. This method will always return the same array
	 * for a type.
	 *
	 * @method getLiveRecordArray
	 * @param {String} typeKey
	 * @returns {Model[]}
	 */
	getLiveRecordArray(typeKey) {
		return this.get('recordCache').getLiveRecordArray(typeKey);
	},

	/**
	 * Fetches a record (or records), either from the cache or from the server.
	 * The type of `options` determines the behavior of this method:
	 *
	 * - `string` fetches a single record by ID
	 * - `string[]` fetches several records by the IDs
	 * - `object` fetches records according to the given query object
	 * - `undefined` fetches all records of the given type
	 *
	 * Any other value, including `null`, will result in an error being thrown.
     *
	 * @method find
	 * @param {String} typeKey
	 * @param {String|String[]|Object} [options]
	 * @return {PromiseObject|PromiseArray}
	 */
	find(typeKey, options) {
		switch (Ember.typeOf(options)) {
			case 'string':
				return this._findSingle(typeKey, options);
			case 'array':
				return this._findMany(typeKey, options);
			case 'object':
				return this._findQuery(typeKey, options);
			case 'undefined':
				if (arguments.length === 1) {
					return this._findAll(typeKey);
				}
				/* falls through */
			default:
				throw new Ember.Error('A bad `find` call was made to the store.');
		}
	},

	/**
	 * Gets a single record from the adapter as a PromiseObject.
	 *
	 * @param {String} typeKey
	 * @param {String} id
	 * @return {PromiseObject}
	 * @private
	 */
	_findSingle(typeKey, id) {
		let promise;

		const record = this.getRecord(typeKey, id);
		if (record) {
			promise = Promise.resolve();
		}

		const recordRequestCache = this.get('recordRequestCache');
		if (!promise) {
			const pendingRequest = recordRequestCache.getPendingRequest(typeKey, id);

			if (pendingRequest) {
				promise = pendingRequest;
			}
		}

		if (!promise) {
			promise = this.adapterFor(typeKey).findRecord(typeKey, id).then((payload) => {
				this.pushPayload(payload);
			});

			recordRequestCache.savePendingRequest(typeKey, id, promise);
		}

		return ModelPromiseObject.create({
			id, typeKey,
			promise: promise.then(() => {
				return this.getRecord(typeKey, id);
			})
		});
	},

	/**
	 * Gets many records from the adapter as a PromiseArray.
	 *
	 * @param {String} typeKey
	 * @param {String[]} ids
	 * @return {PromiseArray}
	 * @private
	 */
	_findMany(typeKey, ids = []) {
		if (ids.length === 0) {
			return PromiseArray.create({
				promise: Promise.resolve([])
			});
		}

		const idsToFetch = ids.filter((id) => {
			return (this.getRecord(typeKey, id) === null);
		});

		let promise;

		if (idsToFetch.length === 0) {
			promise = Promise.resolve();
		}

		const recordRequestCache = this.get('recordRequestCache');
		if (!promise) {
			const pendingRequest = recordRequestCache.getPendingRequest(typeKey, ids);

			if (pendingRequest) {
				promise = pendingRequest;
			}
		}

		if (!promise) {
			promise = this.adapterFor(typeKey).findMany(typeKey, ids).then((payload) => {
				this.pushPayload(payload);
			});

			recordRequestCache.savePendingRequest(typeKey, ids, promise);
		}

		return PromiseArray.create({
			promise: promise.then(() => {
				return ids.map((id) => {
					return this.getRecord(typeKey, id);
				}).toArray();
			})
		});
	},

	/**
	 * Gets all of the records of a type from the adapter as a PromiseArray.
	 *
	 * @param {String} typeKey
	 * @return {PromiseArray}
	 * @private
	 */
	_findAll(typeKey) {
		let promise;

		const recordRequestCache = this.get('recordRequestCache');
		const pendingRequest = recordRequestCache.getPendingRequest(typeKey);
		if (pendingRequest) {
			promise = pendingRequest;
		}

		if (!promise) {
			promise = this.adapterFor(typeKey).findAll(typeKey).then((payload) => {
				this.pushPayload(payload);
			});

			recordRequestCache.savePendingRequest(typeKey, promise);
		}

		return PromiseArray.create({
			promise: promise.then(() => {
				return this.cachedRecordsFor(typeKey);
			})
		});
	},

	/**
	 * Gets records for a query from the adapter as a PromiseArray.
	 *
	 * @param {String} typeKey
	 * @param {Object} query
	 * @return {PromiseArray}
	 * @private
	 */
	_findQuery(typeKey, query) {
		let promise;

		const recordRequestCache = this.get('recordRequestCache');
		const pendingRequest = recordRequestCache.getPendingRequest(typeKey, query);
		if (pendingRequest) {
			promise = pendingRequest;
		}

		if (!promise) {
			promise = this.adapterFor(typeKey).findQuery(typeKey, query);
			recordRequestCache.savePendingRequest(typeKey, query, promise);
		}

		return PromiseArray.create({
			promise: promise.then((payload) => {
				var records = payload.meta.matchedRecords;
				this.pushPayload(payload);

				return records.map((record) => {
					return this.getRecord(record.type, record.id);
				});
			})
		});
	},

	/**
	 * Persists a record (new or old) to the server.
	 *
	 * @method saveRecord
	 * @param {Model} record
	 * @return {Promise} Resolves to the saved record
	 */
	saveRecord(record) {
		if (!record.get('isNew')) {
			return this.updateRecord(record);
		}

		if (!record.isInitialized()) {
			throw new Ember.Error('Can\'t save an uninitialized record.');
		}

		const typeKey = record.get('typeKey');

		return this.adapterFor(typeKey).createRecord(record).then((payload) => {
			const tempId = record.get('id');
			let newId = Ember.get(payload, 'meta.createdRecord.id');

			if (!newId) {
				if (payload[typeKey].length === 1) {
					newId = payload[typeKey][0].id;
				} else {
					throw new Ember.Error('Missing `createdRecord` meta attribute.');
				}
			}

			record.set('id', newId);

			const recordCache = this.get('recordCache');
			recordCache.deleteRecord(typeKey, tempId);
			recordCache.storeRecord(record);
			this.updateRelationshipsWithNewId(typeKey, tempId, newId);

			this.pushPayload(payload);
			return record;
		});
	},

	/**
	 * Saves an old record's changes to the server.
	 *
	 * @method updateRecord
	 * @param {Model} record
	 * @return {Promise} Resolves to the saved record
	 */
	updateRecord(record) {
		var recordJson = {
			id: record.get('id')
		};

		record.constructor.eachAttribute((name) => {
			recordJson[name] = record.get(name);
		});

		record.constructor.eachRelationship((name) => {
			recordJson[name] = record.get(`_${name}`);
		});

		const potentialPayload = {};
		potentialPayload[record.get('typeKey')] = [recordJson];

		return this.adapterFor(record.get('typeKey')).updateRecord(record).then((payload) => {
			this.pushPayload(payload || potentialPayload);
			return record;
		});
	},

	/**
	 * Deletes a record from the server.
	 *
	 * @method deleteRecord
	 * @param {Model} record
	 * @return {Promise}
	 */
	deleteRecord(record) {
		if (record.get('isCreating')) {
			return Promise.reject('Can\'t delete a record before it\'s created.');
		}

		const typeKey = record.get('typeKey');
		const id = record.get('id');

		if (record.get('isNew')) {
			this.deleteRecordFromStore(typeKey, id);
			return Promise.resolve();
		}

		return this.adapterFor(typeKey).deleteRecord(record).then((payload) => {
			this.deleteRecordFromStore(typeKey, id);
			this.pushPayload(payload);
		});
	},

	/**
	 * Deletes a record from the store, removing its relationships and unloading it.
	 * This should only be used when a record has already been deleted from the server.
	 *
	 * @method deleteRecordFromStore
	 * @param {String} typeKey
	 * @param {String} id
	 * @private
	 */
	deleteRecordFromStore(typeKey, id) {
		this.deleteRelationshipsForRecord(typeKey, id);
		this.get('recordCache').deleteRecord(typeKey, id);

		// TODO: #49
		// record.set('store', null);
	},

	/**
	 * Reloads a record from the server.
	 *
	 * @method reloadRecord
	 * @param {Model} record
	 * @return {Promise} Resolves to the reloaded record
	 */
	reloadRecord(record) {
		if (record.get('isDirty') && !this.get('reloadDirty')) {
			throw new Ember.Error('Can\'t reload a record while it\'s dirty and `reloadDirty` is turned off.');
		}

		return this.adapterFor(record.typeKey).findRecord(record.typeKey, record.get('id')).then((payload) => {
			this.pushPayload(payload);
			return record;
		});
	},

	/**
	 * @method extractPayload
	 * @deprecated Renamed to `pushPayload` to be more familiar to Ember-Data users.
	 */
	extractPayload: deprecateMethod('`extractPayload` is deprecated in favor of `pushPayload`', 'pushPayload'),

	/**
	 * Takes a normalized payload from the server and load the
	 * record into the store. This format is called normalized JSON
	 * and allows you to easily load multiple records in at once.
	 * Normalized JSON is a single object that contains keys that are
	 * model type names, and whose values are arrays of JSON records.
	 * In addition, there is a single `meta` key that contains some
	 * extra information that the store may need. For example, say
	 * that the following models were defined:
	 *
	 * ```js
	 * App.Post = EG.Model.extend({
	 *     title: EG.attr({ type: 'string' }),
	 *     tags: EG.hasMany({ relatedType: 'tag', inverse: null })
	 * });
	 *
	 * App.Tag = EG.Model.extend({
	 *     name: EG.attr({ type: 'string' })
	 * });
	 * ```
	 *
	 * A normalized JSON payload for these models might look like this:
	 *
	 * ```json
	 * {
	 *     "post": [
	 *         {
	 *             id: "1",
	 *             title: "Introduction To Ember-Graph",
	 *             tags: []
	 *         },
	 *         {
	 *             id: "2",
	 *             title: "Defining Models",
	 *             tags: [{ "type": "tag", "id": "1" }, { "type": "tag", "id": "3" }]
	 *         },
	 *         {
	 *             id: "3",
	 *             title: "Connecting to a REST API",
	 *             tags: [{ "type": "tag", "id": "2" }]
	 *         }
	 *     ],
	 *     "tag": [
	 *         { id: "1", name: "relationship" },
	 *         { id: "2", name: "adapter" },
	 *         { id: "3", name: "store" }
	 *     ],
	 *     "meta": {}
	 * }
	 * ```
	 *
	 * Notice that the names of the types are in singular form. Also, the
	 * records contain all attributes and relationships in the top level.
	 * In addition, all IDs (either of records or in relationships) must
	 * be strings, not numbers.
	 *
	 * This format allows records to be easily loaded into the store even
	 * if they weren't specifically requested (side-loading). The store
	 * doesn't care how or where the records come from, as long as they can
	 * be converted to this form.
	 *
	 * @method pushPayload
	 * @param {Object} payload
	 */
	pushPayload(payload = {}) {
		if (Object.keys(payload).length === 0) {
			return;
		}

		Ember.changeProperties(() => {
			const reloadDirty = this.get('reloadDirty');

			(Ember.get(payload, 'meta.deletedRecords') || []).forEach((record) => {
				this.deleteRecordFromStore(record.type, record.id);
			});

			delete payload.meta;

			Object.keys(payload).forEach((typeKey) => {
				const model = this.modelFor(typeKey);

				payload[typeKey].forEach((json) => {
					let record = this.getRecord(typeKey, json.id);

					if (record) {
						if (!record.get('isDirty') || reloadDirty) {
							record.loadDataFromServer(json);
						}
					} else {
						record = model.create(this);
						record.set('id', json.id);

						this.get('recordCache').storeRecord(record);
						this.connectQueuedRelationships(record);
						record.loadDataFromServer(json);
					}
				});
			});
		});
	},

	/**
	 * Unloads a record from the store. To get the record, back you must
	 * fetch it from your server again. If the record is dirty when this
	 * is called, an error will be thrown unless you set `discardChanges`
	 * to `true`.
	 *
	 * @method unloadRecord
	 * @param {Model} record
	 * @param {Boolean} [discardChanges=false]
	 */
	unloadRecord(record, discardChanges) {
		if (!discardChanges && record.get('isDirty')) {
			throw new Ember.Error('Can\'t unload a dirty record.');
		}

		Ember.changeProperties(() => {
			record.rollback();

			this.queueConnectedRelationships(record);
			this.get('recordCache').deleteRecord(record.get('typeKey'), record.get('id'));
			record.set('store', null);
		});
	}

});

Store.reopen(LookupMethods);
Store.reopen(RelationshipMethods);

export default Store;