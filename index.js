const express = require("express");
const mongoose = require("mongoose");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const User = require("./models/User");

const Story = require("./models/Story");

mongoose.connect("CONNECTION_STRING", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("Mongoose connected");
}).catch((error) => {
  console.log("Error connecting to MongoDB:", error);
});

app.use(cors());
app.use(express.json());



// const userChangeStream = User.watch();

// userChangeStream.on("change", (change) => {
//   if (change.operationType === "update") {
//     io.emit("user_updated", change);
//   }
// });

// Story.create({
//   user_id:"ba80ce35-a929-4c37-8fa5-f6a4ffd47181",
//   title: "2nd Hello",
//   content: "2 out of 5"
// })
// .then((createdStory) => {
//   console.log("Story created:", createdStory);
// })
// .catch((error) => {
//   console.error("Error creating story:", error);
// });

const userRouter = require("./routes/user");
app.use("/api/user", userRouter);

const storyRouter = require("./routes/story");
app.use("/api/story", storyRouter);




const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});


server.listen(3001, () => {
  console.log("SERVER IS RUNNING");
});



const userSockets = {}; // Map to store uid -> array of socket IDs mappings

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  const userId = socket.handshake.query.userId;
  if (userId) {
    if (!userSockets[userId]) {
      userSockets[userId] = [];
    }
    userSockets[userId].push(socket.id);
  }

  socket.on("set_uid", (userId) => {
    console.log("User ID set:", userId);
    if (!userSockets[userId]) {
      userSockets[userId] = [];
    }
    userSockets[userId].push(socket.id);
  });

  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
    for (const userId in userSockets) {
      const index = userSockets[userId].indexOf(socket.id);
      if (index !== -1) {
        userSockets[userId].splice(index, 1);
        if (userSockets[userId].length === 0) {
          delete userSockets[userId];
        }
        break;
      }
    }
  });
});





// const storyChangeStream = Story.watch();

// storyChangeStream.on("change", async (change) => {
//   if (change.operationType === "update") {
//     try {
//       const storyId = change.documentKey._id;
//       const updatedStory = await Story.findById(storyId).exec();
//       const userId = updatedStory.user_id;

//       const socketId = userSockets[userId];
//       if (socketId) {
//         io.to(socketId).emit("story_updated", { change, updatedStory });
//       }
//     } catch (error) {
//       console.error("Error fetching updated story:", error);
//     }
//   }
// });

const storyChangeStream = Story.watch();
const pendingUpdates = new Map();

storyChangeStream.on("change", async (change) => {
  if (change.operationType === "update") {
    try {
      const storyId = change.documentKey._id.toString();
      const updatedStory = await Story.findById(storyId).exec();
      const userId = updatedStory.user_id;
      console.log(userSockets)
      if (userSockets[userId]) {
        if (!pendingUpdates.has(userId)) {
          pendingUpdates.set(userId, []);
        }
        pendingUpdates.get(userId).push({ change, updatedStory });

        setTimeout(() => {
          const updates = pendingUpdates.get(userId);
          if (updates) {
            io.to(userSockets[userId]).emit("story_updated", updates);
            pendingUpdates.delete(userId);
          }
        }, 3000);
      }
    } catch (error) {
      console.error("Error fetching updated story:", error);
    }
  }
});
