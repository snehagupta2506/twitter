const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')

const databasePath = path.join(__dirname, 'twitterClone.db')

const app = express()

app.use(express.json())

let db = null

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const getFollowingPeopleIdsOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `SELECT following_user_id FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id WHERE user.username='${username}';`;

  const followingPeople = await db.all(getTheFollowingPeopleQuery)

  const arrayOfIds = followingPeople.map((eachUser) => eachUser.following_user_id)

  return arrayOfIds
}

//Authentication Token

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"]
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username;
        request.userId=payload.userId;
        next()
      }
    })
  }
}

const tweetAccessVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params

  const getTweetQuery = `SELECT * FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id='${userId}';`;

  const tweet = await db.get(getTweetQuery)

  if (tweet === undefined) {
    response.status(401)

    response.send('Invalid Request')
  } else {
    next()
  }
}

const validatePassword = password => {
  return password.length > 6
}

app.post('/register', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await db.get(selectUserQuery)

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username,password,name,gender)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
       '${name}',
       
       '${gender}'  
      );`;
    if (validatePassword(password)) {
      await db.run(createUserQuery)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await db.get(selectUserQuery)

  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
        userId:databaseUser.user_id
      }
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})


app.get('/user/tweets/feed/', async (request, response) => {
  const {username} = request
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username)

  const getTweetsQuery = `SELECT username,tweet,date_time as dateTime from user inner join tweet on user.user_id=tweet.user_id where
  user.user_id in (${followingPeopleIds})
  order by date_time DESC 
  limit 4;`;
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.get('/user/following/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowingUsersQuery = `SELECT name from follower inner join user on user.user_id=follower.following_user_id where follower_user-id='${userId}';`
  const followingPeople = await db.get.all(getFollowingUsersQuery)
  response.send(followingPeople)
})

app.get('/user/followers/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowingQuery = `select DISTINCT name from follower inner join user on user.user_id=follower.follower_user_id
  where following_user_id='${userId}',`
  const followers = await db.all(getFollowingQuery)
  response.send(followers)
})

app.get(
  '/tweets/:tweetId/',
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `select tweet,(select COUNT() from Like where tweet_id='${tweetId}') as likes,
  (select COUNT() from reply where tweet_id='${tweetId}') as replies,
  date_time as dateTime from tweet where tweet.tweet_id='${tweetId}';`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

app.get(
  '/tweets/:tweetId/likes',
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getLikesQuery = `select username from user inner join like on user.user_id=like.user_id where tweet_id='${tweetId}';`
    const likedUsers = await db.all(getLikesQuery)
    const userArray = likedUsers.map(eachUser => eachUser.username)
    response.send({likes: userArray})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepliedQuery = `select name,reply from user inner join reply on user.user_id=reply.user_id where tweet_id='${tweetId}';`
    const repliedUser = await db.all(getRepliedQuery)
    response.send({replies: repliedUser})
  },
)

app.get('user/tweets/', authentication, async (request, response) => {
  const {userId} = request
  const getTweetsQuery = `Select tweet,COUNT(DISTINCT like_id) as likes,COUNT(DISTINCT reply_id) as replies,
  date_time as dateTime from tweet left join reply on tweet.tweet_id=reply.tweet_id left join like on tweet.tweet_id=like.tweet_id where tweet.user_id=${userId} group by tweet.tweet_id;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.post('user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `insert into tweet(tweet,user_id,date_time)
  values('${tweet}', '${userId}', '${dateTime}')`

  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const getTheTweetQuery = `select * from tweet where user_id = '${userId}' and tweet_id='${tweetId}';`
  const tweet = await db.get(getTheTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteTweetQuery = `DELETE from tweet where tweet_id='${tweetId}';`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
