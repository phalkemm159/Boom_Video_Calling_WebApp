import express from 'express';
import { createServer } from 'node:http';

import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { connectToSocket } from "./controllers/socketManager.js";

import cors from 'cors';
import userRoutes from  "./routes/users.routes.js";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port", (process.env.POST || 8000));
app.use(cors());
app.use(express.json({limit: "40kb"}));
app.use(express.urlencoded({limit: "40kb", extended: true}));

app.use("/api/v1/users", userRoutes);
// app.use("/api/v2/users", newUserRoutes);

// app.get("/home", (req, res) => {
//     return res.json({"Hello": "World!"});
//     });

const start = async () => {
    try {
        const connectionDb = await mongoose.connect(process.env.DB_LINK, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log(`MongoDB Connected: ${connectionDb.connection.host}`);

        server.listen(app.get("port"), () => {
            console.log(`Server Listening on Port ${app.get("port")}`);
        });
    } catch (error) {
        console.error("Error connecting to MongoDB:", error.message);
        process.exit(1);
    }
};
start();