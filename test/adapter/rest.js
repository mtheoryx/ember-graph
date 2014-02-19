(function() {
	'use strict';

	var prefix = 'http://foo.com/api';
	var store, adapter;

	module('REST Adapter', {
		setup: function() {
			store = setupStore({
				foo: EG.Model.extend(),
				test: EG.Model.extend({
					string: Eg.attr({ type: 'string' }),
					number: Eg.attr({ type: 'number', defaultValue: 0 }),

					belongsTo1: Eg.belongsTo({ relatedType: 'foo', inverse: null }),
					belongsTo2: Eg.belongsTo({
						relatedType: 'foo', inverse: null, isRequired: false, defaultValue: '123' }),
					hasMany: Eg.hasMany({ relatedType: 'foo', inverse: null, isRequired: false })
				})
			});

			adapter = store.get('adapter');

			adapter._prefix = function() {
				return prefix;
			};

			store._loadRecord('test', {
				id: '1',
				string: 'foo',
				number: 42,

				belongsTo1: '1',
				belongsTo2: '2',
				hasMany: ['1', '2', '4', '8']
			});
		}
	});

	asyncTest('Find requests are properly formed', function() {
		expect(3);

		adapter._ajax = function(url, verb, headers, body) {
			start();

			strictEqual(url, prefix + '/test/1');
			strictEqual(verb, 'GET');
			ok(body === undefined || body === '');

			return Em.RSVP.resolve();
		};

		adapter.findRecord('test', '1');
	});

	asyncTest('Find many requests are properly formed', function() {
		expect(3);

		adapter._ajax = function(url, verb, headers, body) {
			start();

			strictEqual(url, prefix + '/test/1,2,3');
			strictEqual(verb, 'GET');
			ok(body === undefined || body === '');

			return Em.RSVP.resolve();
		};

		adapter.findMany('test', ['1', '2', '3']);
	});

	asyncTest('Find all requests are properly formed', function() {
		expect(3);

		adapter._ajax = function(url, verb, headers, body) {
			start();

			strictEqual(url, prefix + '/tests?ids=' + encodeURIComponent('1,2,3'));
			strictEqual(verb, 'GET');
			ok(body === undefined || body === '');

			return Em.RSVP.resolve();
		};

		adapter.findAll('test', ['1', '2', '3']);
	});

	asyncTest('Find query requests are properly formed', function() {
		expect(3);

		adapter._ajax = function(url, verb, headers, body) {
			start();

			strictEqual(url, prefix + '/tests?ids=' + encodeURIComponent('1,2,3') +
				'&search=' + encodeURIComponent('this should be escaped'));
			strictEqual(verb, 'GET');
			ok(body === undefined || body === '');

			return Em.RSVP.resolve();
		};

		adapter.findQuery('test', { search: 'this should be escaped' }, ['1', '2', '3']);
	});

	asyncTest('Create requests are properly formed', function() {
		expect(3);

		adapter._ajax = function(url, verb, headers, body) {
			start();

			strictEqual(url, prefix + '/tests');
			strictEqual(verb, 'POST');

			deepEqual(typeof body === 'string' ? JSON.parse(body) : body, {
				string: '',
				number: 0,
				links: {
					belongsTo1: null,
					belongsTo2: '123',
					hasMany: []
				}
			});


			return Em.RSVP.resolve();
		};

		adapter.createRecord(store.createRecord('test', { string: '', belongsTo1: null }));
	});

	asyncTest('Update requests are properly formed', function() {
		expect(3);

		adapter._ajax = function(url, verb, headers, body) {
			start();

			strictEqual(url, prefix + '/test/1');
			strictEqual(verb, 'PUT');

			if (typeof body === 'string') {
				body = JSON.parse(body);
			}

			body.links.hasMany.sort();

			deepEqual(body, {
				id: '1',
				string: 'foo',
				number: 42,
				links: {
					belongsTo1: '1',
					belongsTo2: '2',
					hasMany: ['1', '2', '4', '8']
				}
			});


			return Em.RSVP.resolve();
		};

		adapter.updateRecord(store.getRecord('test', '1'));
	});

	asyncTest('Delete requests are properly formed', function() {
		expect(3);

		adapter._ajax = function(url, verb, headers, body) {
			start();

			strictEqual(url, prefix + '/test/1');
			strictEqual(verb, 'DELETE');
			ok(body === undefined || body === '');

			return Em.RSVP.Promise.resolve();
		};

		adapter.deleteRecord(store.getRecord('test', '1'));
	});
})();