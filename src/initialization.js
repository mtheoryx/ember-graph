if (Em) {
	// Remember, these are run AFTER the application becomes ready
	Em.onLoad('Ember.Application', function(Application) {
		Application.initializer({
			name: 'store',

			initialize: function(container, App) {
				App.register('store:main', App.Store || EG.Store, { singleton: true });

				App.register('adapter:rest', EG.RESTAdapter, { singleton: true });
				App.register('adapter:fixture', EG.FixtureAdapter, { singleton: true });
				App.register('adapter:localStorage', EG.LocalStorageAdapter, { singleton: true });
				App.register('serializer:json', EG.JSONSerializer, { singleton: true });

				App.register('type:string', EG.StringType, { singleton: true });
				App.register('type:number', EG.NumberType, { singleton: true });
				App.register('type:boolean', EG.BooleanType, { singleton: true });
				App.register('type:date', EG.DateType, { singleton: true });
				App.register('type:object', EG.ObjectType, { singleton: true });
				App.register('type:array', EG.ArrayType, { singleton: true });

				container.lookup('store:main');
			}
		});

		Application.initializer({
			name: 'injectStore',
			before: 'store',

			initialize: function(container, App) {
				App.inject('controller', 'store', 'store:main');
				App.inject('route', 'store', 'store:main');
				App.inject('adapter', 'store', 'store:main');
				App.inject('serializer', 'store', 'store:main');
			}
		});
	});
}