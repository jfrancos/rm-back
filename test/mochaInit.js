// This gets called from mocha.opts

const ngrok = require("ngrok");
const app = require("../dist/app");

before(async () => {
  const url = (await ngrok.connect(process.env.PORT));
  await app.startServer(url);
  app.getUsers().drop();
  console.log(1);
});

after(async () => {  // so mocha doesn't hang without --exit
  // await ngrok.disconnect();
  await ngrok.kill();
  setTimeout(app.close, 1000);
//  app.close();
});
