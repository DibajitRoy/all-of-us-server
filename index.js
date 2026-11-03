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

