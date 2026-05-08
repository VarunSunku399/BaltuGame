# 🦖 BaltuGame — AI-Powered Dino Runner

An educational Dino Runner game where **AI generates quiz questions from any PDF you upload** and turns them into live gameplay events.

## 🎮 How It Works

1. Upload any PDF (textbook, notes, article)
2. The AI reads it and generates multiple-choice questions
3. Run and dodge obstacles — every 10 seconds a question pauses the game
4. **Correct answer** → game resumes
5. **Wrong answer or timeout** → Game Over (sudden death)

## 🧠 Architecture

```
PDF Upload
   ↓
PDF Agent   → Extracts & chunks text
   ↓
Question Agent (Gemini AI) → Generates MCQ questions
   ↓
Orchestrator (WebSocket)  → Streams questions to frontend
   ↓
Game Agent (HTML5 Canvas) → Full-screen quiz pause + physics engine
```

## 🚀 Running Locally

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/BaltuGame.git
cd BaltuGame
```

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Add your Gemini API key
Create `backend/.env`:
```
GEMINI_API_KEY=your_key_here
```
Get a free key at: https://aistudio.google.com/app/apikey

### 4. Start the server
```bash
node server.js
```

### 5. Open in browser
```
http://localhost:3000
```

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 Canvas, Vanilla JS (ES Modules), CSS |
| Backend | Node.js, Express, WebSocket (`ws`) |
| AI | Google Gemini 2.5 Flash |
| PDF Parsing | `pdf-parse` |

## 📁 Project Structure

```
BaltuGame/
├── backend/
│   ├── server.js          # Orchestrator (Express + WebSocket)
│   ├── agentPDF.js        # PDF extraction & chunking
│   ├── agentQuestion.js   # Gemini AI question generation
│   └── package.json
└── frontend/
    ├── index.html
    ├── style.css
    └── src/
        ├── main.js        # UI controller & WebSocket client
        ├── GameEngine.js  # Canvas game loop & physics
        ├── Player.js      # Player entity & AI effects
        └── GameState.js   # Shared game state
```
