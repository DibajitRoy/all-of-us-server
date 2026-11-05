# All of Us: Server

REST API for the **All of Us** social service events platform, built with Express.js and MongoDB.

**Live API:** [https://all-of-us-server-yov1.vercel.app](https://all-of-us-server-yov1.vercel.app)

**Live Client:** [https://all-of-us-client.vercel.app](https://all-of-us-client.vercel.app)

**Client Repository:** [all-of-us-client](https://github.com/DibajitRoy/all-of-us-client)

---

## Features

- JWT-protected private routes, verified against the client's Better Auth JWKS endpoint
- Create, update and delete events, restricted to the user who created them
- Server-side validation for title, description, event type, image URL, location and a future event date
- Upcoming events only: events whose date has passed are never returned
- Search by title or location and filter by event type
- Join an event once per user, with an automatic participant count
- Joined events list sorted by event date

---

## API Routes

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/` | Public | Health check |
| GET | `/featured-events` | Public | 6 nearest upcoming events |
| GET | `/events` | Public | All upcoming events (`?type=` and `?search=`) |
| GET | `/event/:id` | Public | Single event details |
| POST | `/add-event` | Private | Create an event |
| GET | `/my-events` | Private | Events created by the logged-in user |
| PATCH | `/event/:id` | Private (creator only) | Update an event |
| DELETE | `/event/:id` | Private (creator only) | Delete an event |
| POST | `/join-event/:id` | Private | Join an event |
| GET | `/join-status/:id` | Private | Check whether the user has joined an event |
| GET | `/joined-events` | Private | Events joined by the user, sorted by date |

Private routes expect an `Authorization: Bearer <token>` header.

---

## Tech Stack

Node.js, Express.js, MongoDB, jose (JWT verification), CORS. Deployed on Vercel.

---

## Run Locally

```bash
git clone https://github.com/DibajitRoy/all-of-us-server.git
cd all-of-us-server
npm install
node index.js
```

Create a `.env` file in the project root:

```env
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=http://localhost:3000
```

`CLIENT_URL` must be the URL of the client app, because the server fetches its public keys from `CLIENT_URL/api/auth/jwks` to verify tokens.

---

## Deployment

The server is deployed on Vercel. Set `MONGODB_URI` and `CLIENT_URL` (the live client URL) in the Vercel project settings.
