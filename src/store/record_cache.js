import Ember from 'ember';

import { PromiseObject } from 'ember-graph/data/promise_object';

var forEach = Ember.ArrayPolyfills.forEach;

export default Ember.Object.extend({

	cacheTimeout: Ember.computed(function(key, value) {
		if (arguments.length > 1) {
			this.set('_cacheTimeout', typeof value === 'number' ? value : Infinity);
		}

		return this.get('_cacheTimeout');
	}).property('_cacheTimeout'),

	records: {},

	liveRecordArrays: {},

	init: function() {
		this.setProperties({
			_cacheTimeout: Infinity,
			records: {},
			liveRecordArrays: {}
		});
	},

	getRecord: function(typeKey, id) {
		var key = typeKey + ':' + id;
		var records = this.get('records');

		if (records[key] && records[key].timestamp >= (new Date()).getTime() - this.get('cacheTimeout')) {
			return records[key].record;
		}

		return null;
	},

	getRecords: function(typeKey) {
		var records = this.get('records');
		var found = [];
		var cutoff = (new Date()).getTime() - this.get('cacheTimeout');

		forEach.call(Ember.keys(records), function(key) {
			if (key.indexOf(typeKey) === 0 && records[key].timestamp >= cutoff) {
				found.push(records[key].record);
			}
		});

		return found;
	},

	storeRecord: function(record) {
		if (PromiseObject.detectInstance(record)) {
			record = record.getModel();
		}

		var typeKey = record.get('typeKey');

		var records = this.get('records');
		records[typeKey + ':' + record.get('id')] = {
			record: record,
			timestamp: (new Date()).getTime()
		};

		var liveRecordArrays = this.get('liveRecordArrays');
		liveRecordArrays[typeKey] = liveRecordArrays[typeKey] || Ember.A();
		if (!liveRecordArrays[typeKey].contains(record)) {
			liveRecordArrays[typeKey].addObject(record);
		}
	},

	deleteRecord: function(typeKey, id) {
		var records = this.get('records');
		delete records[typeKey + ':' + id];
	},

	getLiveRecordArray: function(typeKey) {
		var liveRecordArrays = this.get('liveRecordArrays');
		liveRecordArrays[typeKey] = liveRecordArrays[typeKey] || Ember.A();
		return liveRecordArrays[typeKey];
	}

});