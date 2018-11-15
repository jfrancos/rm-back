
const callback = require("../dist/app").set_mocha_callback;


// before(done => {
//   function getUsers(cb_users) {
//     done();
//   }
//   callback(getUsers);
// });




// before(done => {
//   callback(done);
// });

before(callback);