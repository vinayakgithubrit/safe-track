# SafeTrack: Real-Time Campus Safety & Tracking

SafeTrack is a real-time location-sharing and safety platform for students.
It combines live tracking, SOS alerts, trusted-friend workflows, and "Walk-Me-Home" monitoring using Socket.IO + MongoDB.

## Why This Project

Campus travel (especially evening commutes) needs fast, low-friction safety tooling.
SafeTrack focuses on:

- Real-time location visibility for trusted users
- Quick emergency escalation (SOS + walk-mode emergency)
- Session-based walking safety (start, monitor, complete, emergency)
- Safe-zone entry/exit awareness

## Tech Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: EJS, Vanilla JS, Leaflet
- Database: MongoDB + Mongoose
- Auth/Security: JWT, bcrypt, helmet, CORS, express-validator

## Key Features

- Live map tracking with periodic location updates
- Guest mode and authenticated mode
- JWT authentication (register/login/profile/logout)
- Friend system:
  - Search users
  - Send/accept/reject/cancel friend requests
  - Remove friends
- Walk-Me-Home:
  - Start session with trusted friends
  - Live path updates to selected friends
  - Complete safely or trigger emergency
- SOS alerts with location payload
- Safe-zone geofencing:
  - Entry/exit detection
  - Zone event logging + broadcast
- Location history persistence with TTL cleanup (30 days)

## Project Structure

```text
Real-Time Tracker/
├── app.js
├── routes/
│   ├── auth.js
│   └── friends.js
├── models/
│   ├── User.js
│   ├── WalkSession.js
│   ├── LocationHistory.js
│   └── SOSAlert.js
├── views/
│   └── index.ejs
├── public/
│   ├── css/
│   └── js/
└── package.json
```

## Core Data Model

- `User`
  - Profile, auth fields, friend graph, request queues, online status
- `WalkSession`
  - Trusted friends, destination, path points, status, emergency entries
- `LocationHistory`
  - Timestamped GPS samples, device/session metadata, TTL index
- `SOSAlert`
  - Emergency type/status/location and notification metadata

## High-Level Architecture

1. Client gets geolocation from browser API.
2. Client emits socket events (`send-location`, `walk-mode-location`, `sos-alert`, etc.).
3. Server authenticates socket (JWT if available; guest fallback otherwise).
4. Server updates MongoDB state and broadcasts to relevant recipients.
5. Frontend updates markers, path polylines, alerts, and activity panels.

## Important Socket Events

- Generic / guest
  - `user-joined`, `get-users`, `users-list`
  - `location-update`, `chat-message`, `sos-alert`
- Authenticated tracking
  - `send-location` -> saves `LocationHistory` + sends friend updates
- Walk mode
  - `walk-mode-start`
  - `walk-mode-location`
  - `walk-mode-complete`
  - `walk-mode-emergency`
  - outbound: `walk-mode-added-you`, `walk-mode-location-update`, `walk-mode-ended`, `walk-mode-emergency-received`
- Geofencing
  - `zone-event` -> appends `logs/zone-events.txt` and emits `zone-event-broadcast`

## REST API Summary

Base paths:

- Auth: `/api/auth`
- Friends: `/api/friends`

Auth endpoints:

- `POST /register`
- `POST /login`
- `GET /profile`
- `PUT /profile`
- `POST /logout`
- `GET /validate`

Friend endpoints:

- `GET /search?query=...`
- `POST /request/send`
- `POST /request/accept`
- `POST /request/reject`
- `POST /request/cancel`
- `GET /list`
- `GET /requests`
- `DELETE /remove`

## Environment Variables

Create a `.env` file:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/safetrack
JWT_SECRET=replace-with-strong-secret
CLIENT_URL=http://localhost:3000

# Optional: enable HTTPS server (required for non-localhost geolocation in many browsers)
SSL_KEY_PATH=/absolute/path/to/key.pem
SSL_CERT_PATH=/absolute/path/to/cert.pem
```

## Local Setup

```bash
npm install
npm start
```

Then open:

- `http://localhost:3000` (or `https://localhost:3000` if SSL configured)

## Security Notes

- Passwords hashed with bcrypt (`saltRounds=12`)
- JWT-based stateless auth
- Input validation via `express-validator`
- Helmet + CORS configured
- Note: CSP currently allows inline/script/style sources for compatibility; tighten for production hardening.

## Current Limitations

- No automated test suite yet
- Some flows still support guest mode by design (weaker identity guarantees)
- Geofence logs are file-based (`logs/zone-events.txt`) instead of centralized observability
- Frontend is mostly monolithic vanilla JS and can be modularized further

## Resume-Ready Highlights

- Built a real-time campus safety web app using Node.js, Express, Socket.IO, MongoDB, and Leaflet.
- Implemented live GPS tracking, SOS alerts, trusted-friend walk sessions, and geofence entry/exit monitoring.
- Designed auth + social graph flows (JWT login, friend requests, online presence, multi-socket fanout).

## Interview Prep

### 60-Second Explanation (Use This)

"SafeTrack is a real-time campus safety platform. I built an Express + Socket.IO backend with MongoDB to stream live location updates and emergency events between trusted users. The system supports both guest and authenticated users, but authenticated mode includes JWT login, friend requests, and online presence. A key feature is Walk-Me-Home, where a user selects up to three trusted friends, starts a session, and shares live path updates until completion or emergency. I also added geofencing so users get safe-zone entry/exit alerts, and I persist location history with TTL cleanup for data retention."

### Questions You Should Expect

1. Why did you choose Socket.IO over polling?
2. How do you ensure only trusted users receive walk-mode updates?
3. How are authentication and guest mode separated?
4. What happens if a user disconnects mid-walk?
5. How do you store and expire location data?
6. How would you scale this for thousands of concurrent users?
7. What security risks exist in real-time location systems?
8. How would you reduce false/duplicate geofence events?
9. Why keep path history capped (last N points)?
10. What production improvements would you implement next?

### Strong Answers (Short Form)

- Socket.IO: bidirectional low-latency communication and room-targeted broadcasts.
- Trust boundary: walk-mode friend IDs are validated against DB friendship relations.
- Disconnect handling: active walk sessions are marked cancelled and trusted friends are notified.
- Data lifecycle: `LocationHistory` uses a TTL index to auto-expire old records.
- Scale path: add Redis adapter, horizontal socket servers, message queues, and rate-limiting.

## Future Improvements

- Add automated tests (unit + integration + socket event tests)
- Add role-based admin dashboard for incident review
- Add push notifications / SMS escalation integration
- Add anomaly detection (inactivity, route deviation, panic patterning)
- Refactor frontend into modular components
