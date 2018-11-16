const callback = require("../dist/app").set_mocha_callback;
const getUsers = require("../dist/app").getUsers;

before(done => {
	callback(() => {		 // this will get called once mongo is initialized
		getUsers().drop(); // empty db before starting tests
		done();
	});
});