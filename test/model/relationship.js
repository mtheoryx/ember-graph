(function() {
	'use strict';

	var BELONGS_TO_KEY = Eg.Model.BELONGS_TO_KEY;
	var HAS_MANY_KEY = Eg.Model.HAS_MANY_KEY;

	var store;

	module('Relationship Functionality Test', {
		setup: function() {
			store = Eg.Store.create();

			store.createModel('user', {
				posts: Eg.hasMany({
					relatedType: 'post',
					inverse: 'author',
					isRequired: false
				})
			});

			store.createModel('post', {
				author: Eg.belongsTo({
					relatedType: 'user',
					inverse: 'posts',
					isRequired: false
				}),

				tags: Eg.hasMany({
					relatedType: 'tag',
					inverse: null,
					isRequired: false,
					defaultValue: ['0']
				})
			});

			store.createModel('tag', {});

			store.createRecord('user', { id: '1', posts: ['1', '2'] });
			store.createRecord('user', { id: '2', posts: ['3'] });
			store.createRecord('user', { id: '3', posts: ['4', '7'] });
			store.createRecord('user', { id: '4', posts: [] });

			store.createRecord('post', { id: '1', author: '1', tags: ['1', '2', '3', '4'] });
			store.createRecord('post', { id: '2', author: '1', tags: ['2', '3'] });
			store.createRecord('post', { id: '3', author: '2', tags: [] });
			store.createRecord('post', { id: '4', author: '3', tags: ['1', '4', '5'] });
			store.createRecord('post', { id: '5', author: '5', tags: ['1', '4', '5'] });
			store.createRecord('post', { id: '6', author: null, tags: ['1', '2', '5'] });

			store.createRecord('tag', { id: '1' });
			store.createRecord('tag', { id: '2' });
			store.createRecord('tag', { id: '3' });
			store.createRecord('tag', { id: '4' });
		}
	});

	test('Relationships are loaded correctly', function() {
		expect(10);

		var user1 = store.getRecord('user', '1');
		var user4 = store.getRecord('user', '4');
		var post1 = store.getRecord('post', '1');
		var post3 = store.getRecord('post', '3');
		var post5 = store.getRecord('post', '5');
		var post6 = store.getRecord('post', '6');

		ok(user1.get('posts').isEqual(['1', '2']));
		ok(user4.get('posts.length') === 0);

		ok(post1.get('author') === '1');
		ok(post1.get('tags').isEqual(['1', '2', '3', '4']));
		ok(post3.get('author') === '2');
		ok(post3.get('tags.length') === 0);
		ok(post5.get('author') === '5');
		ok(post5.get('tags').isEqual(['1', '4', '5']));
		ok(post6.get('author') === null);
		ok(post6.get('tags').isEqual(['1', '2', '5']));
	});

	test('Relationship defaults are loaded correctly', function() {
		expect(3);

		var user = store.createRecord('user');
		ok(user.get('posts.length') === 0);

		var post = store.createRecord('post');
		ok(post.get('author') === null);
		ok(post.get('tags').isEqual(['0']));
	});
})();