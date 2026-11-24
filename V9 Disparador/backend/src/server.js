const { createApp } = require('./app');
const port = Number(process.env.PORT || 3000);
const app = createApp();
app.listen(port, () => console.log(`V8 Disparador backend ouvindo em http://localhost:${port}`));
