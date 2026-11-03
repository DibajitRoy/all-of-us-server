import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT || 8000;

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
    throw err;
  }
}

app.use(cors());
app.use(express.json());

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("socialDevelopment");
const eventCollection = db.collection("events");
const joinedCollection = db.collection("joinedEvents");

// Same user can't join the same event twice
await joinedCollection.createIndex(
  { eventId: 1, userEmail: 1 },
  { unique: true },
);

// ---------- Helpers ----------

const EVENT_TYPES = [
  "Cleanup",
  "Plantation",
  "Donation",
  "Food Distribution",
  "Health Camp",
  "Blood Donation",
  "Education",
  "Other",
];

const isValidId = (id) => /^[a-f\d]{24}$/i.test(String(id));

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// returns an error message (string) or null when everything is fine
const validateEvent = (body = {}) => {
  const { title, description, eventType, thumbnail, location, eventDate } =
    body;

  if (!title || title.trim().length < 5 || title.trim().length > 100) {
    return "Title must be between 5 and 100 characters";
  }
  if (
    !description ||
    description.trim().length < 20 ||
    description.trim().length > 2000
  ) {
    return "Description must be between 20 and 2000 characters";
  }
  if (!EVENT_TYPES.includes(eventType)) {
    return "Please select a valid event type";
  }
  if (!thumbnail || !isValidUrl(thumbnail.trim())) {
    return "Please provide a valid thumbnail image URL";
  }
  if (!location || location.trim().length < 3) {
    return "Location must be at least 3 characters long";
  }
  const date = new Date(eventDate);
  if (!eventDate || Number.isNaN(date.getTime())) {
    return "Please provide a valid event date";
  }
  if (date <= new Date()) {
    return "Event date must be in the future";
  }
  return null;
};

// ---------- JWT middleware ----------

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (!payload.email) {
      return res.status(403).send({ msg: "Forbidden!" });
    }
    req.user = payload; // email, name, image etc.
    next();
  } catch (error) {
    return res.status(401).send({ msg: "Invalid or expired token!" });
  }
};

// ---------- Event APIs ----------

// Create event (private)
app.post("/add-event", verifyToken, async (req, res) => {
  const error = validateEvent(req.body);
  if (error) {
    return res.status(400).send({ msg: error });
  }

  const { title, description, eventType, thumbnail, location, eventDate } =
    req.body;

  const newEvent = {
    title: title.trim(),
    description: description.trim(),
    eventType,
    thumbnail: thumbnail.trim(),
    location: location.trim(),
    eventDate: new Date(eventDate),
    creatorEmail: req.user.email,
    creatorName: req.user.name,
    participants: 0,
    createdAt: new Date(),
  };

  const result = await eventCollection.insertOne(newEvent);
  res.status(201).send(result);
});

// All upcoming events (public) - supports ?type=Cleanup&search=mirpur
app.get("/events", async (req, res) => {
  const { type, search } = req.query;
  const filter = { eventDate: { $gte: new Date() } };

  if (type && type !== "all") {
    filter.eventType = type;
  }
  if (search) {
    const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");
    filter.$or = [{ title: regex }, { location: regex }];
  }

  const result = await eventCollection
    .find(filter)
    .sort({ eventDate: 1 })
    .toArray();
  res.send(result);
});


app.get("/featured-events", async (req, res) => {
  const result = await eventCollection
    .find({ eventDate: { $gte: new Date() } })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray();
  res.send(result);
});


app.get("/my-events", verifyToken, async (req, res) => {
  const result = await eventCollection
    .find({ creatorEmail: req.user.email })
    .sort({ eventDate: 1 })
    .toArray();
  res.send(result);
});


app.get("/event/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid event id" });
  }

  const result = await eventCollection.findOne({ _id: new ObjectId(id) });
  if (!result) {
    return res.status(404).send({ msg: "Event not found" });
  }
  res.send(result);
});


app.patch("/event/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid event id" });
  }

  const event = await eventCollection.findOne({ _id: new ObjectId(id) });
  if (!event) {
    return res.status(404).send({ msg: "Event not found" });
  }
  if (event.creatorEmail !== req.user.email) {
    return res
      .status(403)
      .send({ msg: "You can only update your own events" });
  }

  const error = validateEvent(req.body);
  if (error) {
    return res.status(400).send({ msg: error });
  }

  const { title, description, eventType, thumbnail, location, eventDate } =
    req.body;

  const updatedData = {
    title: title.trim(),
    description: description.trim(),
    eventType,
    thumbnail: thumbnail.trim(),
    location: location.trim(),
    eventDate: new Date(eventDate),
    updatedAt: new Date(),
  };

  const result = await eventCollection.updateOne(
    { _id: event._id },
    { $set: updatedData },
  );

  // keep joined events data in sync
  await joinedCollection.updateMany(
    { eventId: event._id },
    {
      $set: {
        title: updatedData.title,
        thumbnail: updatedData.thumbnail,
        location: updatedData.location,
        eventType: updatedData.eventType,
        eventDate: updatedData.eventDate,
      },
    },
  );

  res.json(result);
});


app.delete("/event/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid event id" });
  }

  const event = await eventCollection.findOne({ _id: new ObjectId(id) });
  if (!event) {
    return res.status(404).send({ msg: "Event not found" });
  }
  if (event.creatorEmail !== req.user.email) {
    return res
      .status(403)
      .send({ msg: "You can only delete your own events" });
  }

  const result = await eventCollection.deleteOne({ _id: event._id });
  await joinedCollection.deleteMany({ eventId: event._id });
  res.json(result);
});



// Join an event (private)
app.post("/join-event/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid event id" });
  }

  const event = await eventCollection.findOne({ _id: new ObjectId(id) });
  if (!event) {
    return res.status(404).send({ msg: "Event not found" });
  }
  if (new Date(event.eventDate) < new Date()) {
    return res.status(400).send({ msg: "This event has already ended" });
  }

  try {
    const result = await joinedCollection.insertOne({
      eventId: event._id,
      title: event.title,
      thumbnail: event.thumbnail,
      location: event.location,
      eventType: event.eventType,
      eventDate: event.eventDate,
      userEmail: req.user.email,
      userName: req.user.name,
      joinedAt: new Date(),
    });

    await eventCollection.updateOne(
      { _id: event._id },
      { $inc: { participants: 1 } },
    );

    res.status(201).send(result);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).send({ msg: "You have already joined this event" });
    }
    throw err;
  }
});


app.get("/join-status/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid event id" });
  }

  const joined = await joinedCollection.findOne({
    eventId: new ObjectId(id),
    userEmail: req.user.email,
  });
  res.send({ joined: Boolean(joined) });
});

// Joined events of the logged-in user, sorted by event date (private)
app.get("/joined-events", verifyToken, async (req, res) => {
  const result = await joinedCollection
    .find({ userEmail: req.user.email })
    .sort({ eventDate: 1 })
    .toArray();
  res.send(result);
});



app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ msg: "Something went wrong on the server" });
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});

export default app;