# Job Portal Chat Prototype

This project is a simple private chat feature for a job portal built with:

- React frontend
- Express + Socket.IO backend
- Local JSON file storage
- Client-side end-to-end encryption using `tweetnacl`

## Setup

1. Open two terminals.

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run start
```

The backend listens on `http://localhost:4000`.

> Note: `.env` is ignored by git, so keep your local secrets private and use `backend/.env.example` as the template.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

## How it works

- Sign in as a `Job Seeker` or `Employer` and open the chat workspace.
- Browse job postings, candidate profiles, or start a secure conversation from any listing.
- Chat rooms are created with deterministic IDs based on two user IDs.
- Users exchange public keys during chat setup so messages can be encrypted client-side.
- Messages are encrypted in the browser before sending and stored on the server only as ciphertext.
- The server relays encrypted chat content over Socket.IO in real time.
- The frontend decrypts messages locally using a shared key derived from both users' keys.
- The app preserves the hiring workflow: choose role, find a match, open chat, send encrypted messages, and close the loop.

## User journey

1. Landing page introduces the secure hiring workspace.
2. User selects sign in or register, then chooses a role.
3. Job seekers browse jobs; employers browse candidates.
4. User clicks `Start chat` from a job or profile.
5. The app opens a private encrypted chat with realtime Socket.IO delivery.
6. Messages are decrypted locally for the user only.
7. User signs out when the conversation is complete.

## Notes

- This implementation is a prototype. For production, add authentication, HTTPS, and a real database.
- The frontend includes a simple login simulation and persists the selected user across reloads.
- JSON storage is used here for a simple demo and is not suitable for large-scale systems.
# chatback
