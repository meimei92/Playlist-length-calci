# YouTube Playlist Length Calculator

A simple web application that calculates the total duration of any public YouTube playlist using the YouTube Data API v3.

## Live Demo

https://playlist-length-calc-tan.vercel.app

## Features

* Calculate the total duration of a YouTube playlist
* Display the total number of videos
* Fast and simple interface
* Uses the YouTube Data API v3
* Fully client-side application
* Deployed on Vercel

## Built With

* HTML5
* CSS3
* JavaScript (Vanilla JS)
* YouTube Data API v3
* Vercel

## How It Works

1. Enter a YouTube playlist URL.
2. The application extracts the playlist ID.
3. It fetches playlist videos using the YouTube Data API v3.
4. Video durations are retrieved and summed.
5. The total playlist duration is displayed.

## Screenshots

### Home Page

<img width="2839" height="1377" alt="Screenshot 2026-06-07 213229" src="https://github.com/user-attachments/assets/9b8d1c45-593f-4e14-af3b-f4e33fe74ccc" />

### Results

<img width="2848" height="1549" alt="Screenshot 2026-06-07 213250" src="https://github.com/user-attachments/assets/6a593cb5-908d-4fb4-8353-1090af032f2b" />

## Setup

This project requires a YouTube Data API v3 key.

1. Create a YouTube Data API v3 key in Google Cloud.
2. Open `config.js`.
3. Replace:

```js
const API_KEY = "YOUR_YOUTUBE_API_KEY_HERE";
```

with your own API key.

## Running Locally

1. Clone the repository:

```bash
git clone https://github.com/meimei92/Playlist-length-calc.git
```

2. Navigate to the project folder:

```bash
cd Playlist-length-calc
```

3. Open `index.html` in your browser.

## Author

GitHub: https://github.com/meimei92

