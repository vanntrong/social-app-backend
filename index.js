import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import mongoose from "mongoose";
import morgan from "morgan";
import { Server } from "socket.io";
import authRoute from "./routes/auth.js";
import conversationRoute from "./routes/conversation.js";
import friendRoute from "./routes/friend.js";
import messageRoute from "./routes/message.js";
import notificationRoute from "./routes/notification.js";
import postRoute from "./routes/posts.js";
import searchRoute from "./routes/search.js";
import storyRoute from "./routes/story.js";
import tokenRoute from "./routes/token.js";
import usersRoute from "./routes/users.js";
dotenv.config({
  path: "./.env",
});
const app = express();

const httpServer = createServer(app);

//middleware
app.use(
  cors({
    origin:
      process.env.MODE === "dev"
        ? ["http://localhost:3000"]
        : ["https://social-app.vovantrong.online"],
  })
);
app.use(morgan("short"));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(cookieParser());

const PORT = process.env.PORT || 8800;

app.get("/", (req, res) => {
  return res.send("Hello from server updated");
});

app.use("/auth", authRoute);
app.use("/users", usersRoute);
app.use("/posts", postRoute);
app.use("/token", tokenRoute);
app.use("/search", searchRoute);
app.use("/friend", friendRoute);
app.use("/story", storyRoute);
app.use("/conversation", conversationRoute);
app.use("/message", messageRoute);
app.use("/notification", notificationRoute);

mongoose.connect(process.env.DB_CONNECTION, (err) => {
  if (err) throw err;
  else {
    console.log("Connected to DB");
  }
});

httpServer.listen(PORT, (e) => {
  console.log("Server is running on port: ", PORT);
  console.log("Go to / to see the result");
});

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.MODE === "dev"
        ? ["http://localhost:3000"]
        : ["https://social-app.vovantrong.online"],
  },
});

let onlineUsers = [];

const addNewUser = (userId, socketId) => {
  !onlineUsers.some((user) => user.userId === userId) &&
    onlineUsers.push({ userId, socketId });
};

const removeUser = (socketId) => {
  onlineUsers = onlineUsers.filter((user) => user.socketId !== socketId);
};

const getUser = (userId) => {
  return onlineUsers.find((user) => user.userId === userId);
};

const getSocketId = (userId) => {
  return onlineUsers.find((user) => user.userId === userId)?.socketId;
};

io.on("connection", (socket) => {
  socket.on("setup", (userId) => {
    addNewUser(userId, socket.id);
    socket.emit("getOnlineUsers", onlineUsers);
  });

  socket.on("join chat", (room) => {
    socket.join(room);
  });

  socket.on("newMessage", (message, conversation) => {
    conversation.members.forEach((member) => {
      if (member._id !== message.sender._id) {
        const socketId = getSocketId(member._id);
        if (socketId) {
          io.in(socketId).emit("getMessage", message);
        }
      }
    });
  });

  socket.on("createConversation", ({ creator, conversation }) => {
    conversation.members.forEach((user) => {
      if (user._id !== creator) {
        const socketId = getSocketId(user._id);
        io.to(socketId).emit("getConversation", { conversation });
      }
    });
  });

  socket.on("change-group-info", (userChange, group, message) => {
    group.members.forEach((user) => {
      const socketId = getSocketId(user._id);
      if (user._id !== userChange._id) {
        io.to(socketId).emit("get-change-group-info", { userChange, group });
        io.to(socketId).emit("getMessage", message);
      } else {
        io.to(socketId).emit("getMessage", message);
      }
    });
  });

  socket.on("typing", (room) => {
    socket.in(room).emit("typing", room);
  });

  socket.on("stop typing", (room) => {
    socket.in(room).emit("stop typing", room);
  });

  socket.on("send-friend-request", (friendRequest) => {
    const socketId = getSocketId(friendRequest.receiver);
    if (socketId) {
      io.to(socketId).emit("get-friend-request", friendRequest);
    }
  });

  socket.on("send-notification", (notification) => {
    notification.to.forEach((user) => {
      const socketId = getSocketId(user._id);
      if (socketId) {
        io.to(socketId).emit("get-notification", notification);
      }
    });
  });

  socket.on("disconnect", () => {
    removeUser(socket.id);
    socket.emit("getOnlineUsers", onlineUsers);
  });
});
