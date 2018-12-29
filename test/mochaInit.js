// This gets called from mocha.opts

const ngrok = require("ngrok");
const app = require("../dist/app");

before(async () => {
  const url = (await ngrok.connect(process.env.PORT));
  await app.startServer(url);
  app.getUsers().drop();
});

after(async () => { // Heroku will call SIGTERM every day
  process.kill(process.pid, 'SIGTERM');
});
