# Smart Tourist Monitoring System (Project Overview)

## High-level idea
This project aims to improve tourist safety using:
- **Geofencing**: detect entry into danger zones and notify the user; escalate to authorities if needed
- **AI (future server)**: detect anomalies/inactivity/movement risk patterns using sensor/location features
- **IPFS + Blockchain (future)**: store verified government document hashes/metadata so records can’t be easily modified

There are **two web portals**:
- **User portal** (tourists): register/login, share location, receive alerts, SOS, chatbot
- **Authority portal** (police/rescue/administrators): login, view nearby alerts, see user last known location, act on alerts

## User portal flow
### Registration / verification (future)
- User registers with personal details:
  - name, DOB, place, and other important fields
- User uploads a government document (PDF/image).
- Document data is extracted via OCR/PDF parsing and **cross-verified** with entered data.
- If valid:
  - document stored on **IPFS**
  - IPFS CID / hash is stored on **blockchain** (immutability / tamper resistance)

### Live monitoring (MVP + future)
The user app collects location-related data (for monitoring and AI features), such as:
- latitude, longitude, timestamp
- accuracy
- heading
- altitude
- optional speed (not relied upon for core logic; can be noisy)

This enables computing features like distance, time difference, speed, acceleration, movement consistency, etc. (primarily for the future AI model).

### Alert types
- **Geofence alert** (MVP): triggered when user enters a configured danger zone.
- **SOS alert** (MVP): user presses SOS button to request help.
- **Anomaly / inactivity alerts** (future): detected by AI model (e.g. unusual movement, phone stationary for long time, sudden changes).

### Notifications / escalation (future detail)
- When user enters a danger zone:
  - notify user immediately
  - if user does not leave, escalate alert to nearest authorities (via authority dashboard + dispatch workflow)

## Authority portal flow
Authorities log in and see:
- **Nearby alerts** (based on authority current lat/lng + radius)
- user details (as permitted by policies)
- **user last known location** and alert context
- alert status and history (e.g. OPEN → ACKED → RESOLVED)

Future enhancements may include:
- viewing verified documents via IPFS (CID link)
- AI-generated alert summaries / risk scoring
- dispatch workflow (DISPATCHED, FALSE_ALARM, etc.)

## Backend architecture (MVP)
Two separate FastAPI servers are planned:
- **Core backend API**: auth verification, zones, location pings, geofence alerts, SOS alerts, nearby alert queries
- **AI server** (separate process): anomaly detection model inference (called periodically)

Database and authentication are handled by **Supabase**.

