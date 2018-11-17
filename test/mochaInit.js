const app = require("../dist/app");

before(done => {				// this will get called once mongo is initialized:
	app.set_mocha_callback(() => {		 	//    we don't want mocha to manipulate db before it's up.
		app.getUsers().drop();  // empty db before starting tests
		done();							// now we can start tests
	});
});

after(app.close); 					// so mocha doesn't hang without --exit