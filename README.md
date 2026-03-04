# ChatFlow v2.0 - Full-Stack Chat Application

A comprehensive real-time chat application with PostgreSQL, featuring OAuth/MFA/Passkey authentication, admin dashboard, groups, friends system, and unique features like reactions and threads.

## 🚀 Live Demo
**Frontend**: https://zygge7a4hg76u.ok.kimi.link

## ✨ New Features in v2.0

### 🗄️ Database Migration
- **Migrated from MongoDB to PostgreSQL** for better relational data handling
- **Prisma ORM** for type-safe database operations
- **Advanced schema design** with proper relationships and indexes

### 👥 Friends System
- **Send/Receive Friend Requests** - Connect with other users
- **Accept/Decline Requests** - Manage incoming requests
- **Friend List** - View all your connections
- **Remove Friends** - Unfriend users
- **Block Users** - Prevent unwanted contact

### 👨‍👩‍👧‍👦 Groups
- **Create Groups** - Public or private with invite codes
- **Group Management** - Add/remove members, assign roles (Owner/Admin/Member)
- **Group Messages** - Real-time messaging within groups
- **Join via Invite Code** - Easy group joining for private groups
- **Leave Group** - Exit groups you're no longer interested in

### 😀 Message Reactions
- **Emoji Reactions** - React to messages with emojis
- **Real-time Updates** - See reactions instantly
- **Toggle Reactions** - Add/remove your reactions

### 💬 Thread Replies
- **Reply to Messages** - Create threaded conversations
- **Nested Discussions** - Keep conversations organized

### 🔔 Notifications System
- **Friend Request Notifications** - Get notified of new requests
- **Message Notifications** - Know when you receive messages
- **Group Notifications** - Stay updated on group activity
- **Mark as Read** - Manage your notification inbox

### 🛡️ Admin Dashboard
- **Dashboard Statistics** - View total users, messages, online users, etc.
- **User Management** - View, search, and delete users
- **Group Management** - Monitor and manage all groups
- **Admin Logs** - Audit trail of all admin actions
- **System Broadcast** - Send messages to all users
- **Charts & Analytics** - Visualize app usage over time

### 🔐 Enhanced Security
- **Session Tracking** - Detailed device and location info for each session
- **Admin Logs** - Track all administrative actions
- **Rate Limiting Support** - Built-in rate limiting schema

## 📁 Project Structure

```
/mnt/okcomputer/output/
├── app/                    # React Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/     # Admin Dashboard
│   │   │   ├── auth/      # Login, Register, Settings
│   │   │   ├── chat/      # Chat UI components
│   │   │   └── call/      # Call modal
│   │   ├── context/       # ChatContext
│   │   ├── services/      # API & Socket services
│   │   └── types/         # TypeScript types
│   └── dist/              # Built frontend
│
└── backend/               # Node.js/Express Backend
    ├── prisma/
    │   └── schema.prisma  # PostgreSQL schema
    ├── src/
    │   ├── controllers/   # All API controllers
    │   ├── middleware/    # Auth & Socket middleware
    │   ├── routes/        # API routes
    │   ├── lib/           # Prisma client
    │   └── utils/         # Utilities
    └── package.json
```

## 🛠️ Tech Stack

### Backend
- **Node.js + Express** - Server framework
- **TypeScript** - Type safety
- **PostgreSQL** - Relational database
- **Prisma ORM** - Database toolkit
- **Socket.IO** - Real-time communication
- **Passport.js** - OAuth authentication
- **WebAuthn** - Passkey authentication
- **Speakeasy** - MFA/TOTP
- **JWT** - Token authentication

### Frontend
- **React 19 + TypeScript** - UI framework
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Socket.IO Client** - Real-time communication
- **Axios** - HTTP client
- **WebRTC** - Peer-to-peer calls

## 📊 Database Schema

### Core Models
- **User** - User accounts with OAuth, MFA, Passkey support
- **Session** - Device tracking with location info
- **Passkey** - WebAuthn credentials
- **Message** - Direct messages with reactions and threads
- **Group** - Group chats with members
- **GroupMessage** - Messages within groups
- **Friend** - Friend requests and relationships
- **Notification** - User notifications
- **AdminLog** - Audit trail for admin actions

### Advanced Features
- **MessageReaction** - Emoji reactions on messages
- **ThreadReply** - Nested message replies
- **Poll/PollOption/PollVote** - Voting system (ready to implement)
- **RateLimit** - Rate limiting tracking

## 🔧 Environment Variables

### Backend (.env)
```env
# Server
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/chatflow?schema=public"

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# WebAuthn
RP_ID=localhost
ORIGIN=http://localhost:5173
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

## 🚀 Running Locally

### 1. Setup PostgreSQL
```bash
# Create database
createdb chatflow
```

### 2. Setup Backend
```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma generate
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### 3. Setup Frontend
```bash
cd app
npm install
npm run dev
```

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/google` - Google OAuth
- `GET /api/auth/github` - GitHub OAuth
- `POST /api/auth/mfa/setup` - Setup MFA
- `POST /api/auth/mfa/verify` - Verify MFA code

### Users
- `GET /api/users/profile` - Get current user
- `PATCH /api/users/profile` - Update profile
- `GET /api/users/friends` - Get friends list
- `POST /api/users/friends/request` - Send friend request
- `POST /api/users/friends/requests/:id/accept` - Accept request
- `GET /api/users/search?query=` - Search users

### Groups
- `POST /api/groups` - Create group
- `GET /api/groups` - Get my groups
- `GET /api/groups/:id` - Get group details
- `POST /api/groups/join` - Join with invite code
- `POST /api/groups/:id/members` - Add member

### Messages
- `GET /api/messages/:userId` - Get direct messages
- `POST /api/messages` - Send message
- `POST /api/messages/:id/reactions` - Add reaction
- `GET /api/messages/group/:groupId` - Get group messages

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/users` - List all users
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/groups` - List all groups
- `POST /api/admin/broadcast` - Send broadcast

## 🌟 Unique Features

### 1. **Message Reactions**
React to any message with emojis. See who reacted and with what emoji in real-time.

### 2. **Thread Replies**
Create nested discussions by replying to specific messages. Keep conversations organized.

### 3. **Group Invite Codes**
Private groups can be joined via unique invite codes. Regenerate codes anytime.

### 4. **Admin Dashboard**
Complete admin interface with:
- Real-time statistics
- User/Group management
- System broadcasts
- Audit logs
- Usage analytics

### 5. **Device Tracking**
Every session tracks:
- Browser & OS info
- Device type
- IP address & geolocation
- Last active time

### 6. **Notification System**
Comprehensive notifications for:
- Friend requests
- New messages
- Group invites
- System announcements

## 🔮 Future Enhancements

- [ ] **Message Editing** - Edit sent messages
- [ ] **Polls** - Create and vote in polls
- [ ] **File Sharing** - Upload and share files
- [ ] **Voice/Video Messages** - Record and send media
- [ ] **Screen Sharing** - Share screen during calls
- [ ] **Message Search** - Search through message history
- [ ] **Dark Mode** - Toggle between light/dark themes
- [ ] **Push Notifications** - Browser push notifications
- [ ] **Mobile App** - React Native mobile application

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

---

Built with ❤️ using React, Node.js, PostgreSQL, and Socket.IO
