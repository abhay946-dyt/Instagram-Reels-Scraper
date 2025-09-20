# Instagram Reels Scraper API
Fast Node.js API to scrape public Instagram Reels.

## Deployed API
[Try it here](https://instagram-reels-scraper-ak7s.onrender.com/scrape?username=nike&limit=1)

## Usage
### GET request
/scrape?username=nike&limit=10

- `username`: Instagram username of the public account  
- `limit`: Number of reels to fetch (default 30 if not provided)

### POST request
POST /scrape
Content-Type: application/json

{
"username": "nike",
"limit": 10
}

## Example Response
```json
[
  {
    "id": "1234567890",
    "url": "https://www.instagram.com/reel/ABC123/",
    "caption": "Awesome reel!",
    "likes": 1200,
    "comments": 30
  }
]
