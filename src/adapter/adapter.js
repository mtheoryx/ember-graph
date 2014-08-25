/**
 * An interface for an adapter. And adapter is used to communicate with
 * the server. The adapter is never called directly, its methods are
 * called by the store to perform its operations.
 *
 * The adapter should return normalized JSON from its operations. Details
 * about normalized JSON can be found in the {{link-to-method 'Store' 'pushPayload'}}
 * documentation.
 *
 * @class Adapter
 * @constructor
 * @category abstract
 */
EG.Adapter = Em.Object.extend({

	/**
	 * The store that this adapter belongs to.
	 * This might be needed to get models and their metadata.
	 *
	 * @property store
	 * @type Store
	 * @final
	 */
	store: null,

	/**
	 * @property serializerCache
	 * @type Object
	 * @private
	 * @final
	 */
	serializerCache: {},

	initializeSerializerCache: Em.on('init', function() {
		this.set('serializerCache', {});
	}),

	/**
	 * Persists a record to the server. The returned JSON
	 * must include the `newId` meta attribute as described
	 * {{link-to-method 'here' 'Serializer' 'deserialize'}}.
	 *
	 * @method createRecord
	 * @param {Model} record
	 * @return {Promise} Resolves to the normalized JSON
	 * @category abstract
	 */
	createRecord: EG.abstractMethod('createRecord'),

	/**
	 * Fetch a record from the server.
	 *
	 * @method findRecord
	 * @param {String} typeKey
	 * @param {String} id
	 * @return {Promise} Resolves to the normalized JSON
	 * @category abstract
	 */
	findRecord: EG.abstractMethod('findRecord'),

	/**
	 * The same as find, only it should load several records.
	 *
	 * @method findMany
	 * @param {String} typeKey
	 * @param {String[]} ids
	 * @return {Promise} Resolves to the normalized JSON
	 * @category abstract
	 */
	findMany: EG.abstractMethod('findMany'),

	/**
	 * The same as find, only it should load all records of the given type.
	 *
	 * @method findAll
	 * @param {String} typeKey
	 * @return {Promise} Resolves to the normalized JSON
	 * @category abstract
	 */
	findAll: EG.abstractMethod('findAll'),

	/**
	 * Queries the server for records of the given type. The resolved
	 * JSON should include the `queryIds` meta attribute as
	 * described {{link-to-method 'here' 'Serializer' 'deserialize'}}.
	 *
	 * @method findQuery
	 * @param {String} typeKey
	 * @param {Object} query The query object passed into the store's `find` method
	 * @return {Promise} Resolves to the normalized JSON
	 * @category abstract
	 */
	findQuery: EG.abstractMethod('findQuery'),

	/**
	 * Saves the record's changes to the server.
	 *
	 * @method updateRecord
	 * @param {Model} record
	 * @return {Promise} Resolves to the normalized JSON
	 * @category abstract
	 */
	updateRecord: EG.abstractMethod('updateRecord'),

	/**
	 * Deletes the record.
	 *
	 * @method deleteRecord
	 * @param {Model} record
	 * @return {Promise} Resolves to the normalized JSON
	 * @category abstract
	 */
	deleteRecord: EG.abstractMethod('deleteRecord'),

	/**
	 * Gets the serializer specified for a type. It first tries to get
	 * a type-specific serializer. If it can't find one, it tries to use
	 * the application serializer. If it can't find one, it uses the default
	 * {{link-to-class 'JSONSerializer'}}.
	 *
	 * @method serializerFor
	 * @param {String} typeKey
	 * @return {Serializer}
	 * @protected
	 */
	serializerFor: function(typeKey) {
		var serializerCache = this.get('serializerCache');

		if (!serializerCache[typeKey]) {
			var container = this.get('container');

			serializerCache[typeKey] =
				container.lookup('serializer:' + (typeKey || 'application')) ||
				container.lookup('serializer:application') ||
				container.lookup('serializer:json');
		}

		return serializerCache[typeKey];
	},

	/**
	 * Serializes the given record. By default, it defers to the serializer.
	 *
	 * @method serialize
	 * @param {Model} record
	 * @param {Object} options
	 * @return {Object} Serialized record
	 * @protected
	 */
	serialize: function(record, options) {
		return this.serializerFor(record.get('typeKey')).serialize(record, options);
	},

	/**
	 * Deserializes the given payload. By default, it defers to the serializer.
	 *
	 * @method deserialize
	 * @param {JSON} payload
	 * @param {Object} options
	 * @return {Object} Normalized JSON payload
	 * @protected
	 */
	deserialize: function(payload, options) {
		return this.serializerFor(options.recordType).deserialize(payload, options);
	}
});
