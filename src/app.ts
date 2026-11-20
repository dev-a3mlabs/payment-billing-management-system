import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import routes from './routes.js';

const app = express();

// Requests through ngrok arrive from the local ngrok agent; trust only that hop for the real client IP.
app.set('trust proxy', 'loopback');

app.use(helmet());
// app.use(cors());
app.use(
  cors({
    origin: '*',
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "ngrok-skip-browser-warning"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
