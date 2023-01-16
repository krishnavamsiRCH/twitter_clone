const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
let db = null;

const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();

//API-1
//register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectedUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(selectedUserQuery);

  if (userExistence !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserExistence = `
            INSERT INTO
                user(username, password, name, gender)
            VALUES ('${username}', '${hashedPassword}', '${name}', '${gender}');`;
      await db.run(createUserExistence);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API-2
//login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectedUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(selectedUserQuery);
  if (userExistence === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userExistence.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "UNIQUE_PASSWORD");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Middleware Function
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authorizationHeader = request.headers["authorization"];
  if (authorizationHeader !== undefined) {
    jwtToken = authorizationHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "UNIQUE_PASSWORD", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-3
//User tweets feed
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectedUserQuery = `
        SELECT
            user_id
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(selectedUserQuery);

  const getFollowerUserIdQuery = `
    SELECT
        *
    FROM
        follower
    WHERE
        follower_user_id = ${userExistence.user_id};`;
  const getFollowerUserIdsQuery = await db.all(getFollowerUserIdQuery);

  const getFollowerUserIds = getFollowerUserIdsQuery.map(
    (eachIds) => eachIds.following_user_id
  );

  const getTweetsQuery = `
    SELECT
        user.username,
        tweet.tweet,
        tweet.date_time AS dateTime
    FROM
        user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE
        user.user_id IN (${getFollowerUserIds})
    ORDER BY
        tweet.date_time DESC
    LIMIT
        4;`;

  const getTweets = await db.all(getTweetsQuery);
  response.send(getTweets);
  console.log(getTweets);
});

//API-4
//user following
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectedUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(selectedUserQuery);

  const getFollowingUserIDsQuery = `
    SELECT
        following_user_id
    FROM
        follower
    WHERE
        follower_user_id = ${userExistence.user_id};`;
  const followingIDs = await db.all(getFollowingUserIDsQuery);

  const getFollowingIDs = followingIDs.map(
    (eachUser) => eachUser.following_user_id
  );

  const getUserNameQuery = `
        SELECT
            name
        FROM
            user
        WHERE
            user_id IN (${getFollowingIDs});`;
  const userNames = await db.all(getUserNameQuery);
  response.send(userNames);
});

//API-5
//user followers
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectedUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(selectedUserQuery);

  const getFollowerUserIDsQuery = `
    SELECT
        follower_user_id
    FROM
        follower
    WHERE
        following_user_id = ${userExistence.user_id};`;
  const followerIDs = await db.all(getFollowerUserIDsQuery);

  const getFollowerIDs = followerIDs.map(
    (eachUser) => eachUser.follower_user_id
  );

  const getUserNameQuery = `
        SELECT
            name
        FROM
            user
        WHERE
            user_id IN (${getFollowerIDs});`;
  const userNames = await db.all(getUserNameQuery);
  response.send(userNames);
});

//API-6
//tweets tweetId
const convertTweetsDBObject = (tweetData, likesCount, repliesCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: repliesCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getSelectedUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(getSelectedUserQuery);

  const getFollowingUserIDsQuery = `
    SELECT
        following_user_id
    FROM
        follower
    WHERE
        follower_user_id = ${userExistence.user_id};`;
  const followingIDs = await db.all(getFollowingUserIDsQuery);

  const getFollowingIDs = followingIDs.map(
    (eachUser) => eachUser.following_user_id
  );

  const getTweetIDsQuery = `
    SELECT
        tweet_id
    FROM
        tweet
    WHERE
        user_id IN (${getFollowingIDs});`;
  const tweetIDs = await db.all(getTweetIDsQuery);

  const getTweetIDs = tweetIDs.map((eachUser) => eachUser.tweet_id);

  if (getTweetIDs.includes(parseInt(tweetId))) {
    const getTweetAndTweetDateQuery = `
            SELECT
                tweet,
                date_time
            FROM
                tweet
            WHERE
                tweet_id = ${tweetId};`;
    const tweetData = await db.get(getTweetAndTweetDateQuery);

    const getLikesQuery = `
        SELECT
            COUNT(user_id) AS likes
        FROM
            like
        WHERE
            tweet_id = ${tweetId};`;
    const likesCount = await db.get(getLikesQuery);

    const getRepliesQuery = `
        SELECT
            COUNT(user_id) AS replies
        FROM
            reply
        WHERE
            tweet_id = ${tweetId};`;
    const repliesCount = await db.get(getRepliesQuery);

    response.send(convertTweetsDBObject(tweetData, likesCount, repliesCount));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7
//tweets tweetId likes
const userNamesList = (likedUserNames) => {
  return {
    likes: likedUserNames,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getSelectedUserQuery = `
        SELECT
            user_id
        FROM
            user
        WHERE
            username = '${username}';`;
    const userExistence = await db.get(getSelectedUserQuery);

    const getFollowingUserIDsQuery = `
    SELECT
        following_user_id
    FROM
        follower
    WHERE
        follower_user_id = ${userExistence.user_id};`;
    const followingIDs = await db.all(getFollowingUserIDsQuery);

    const getFollowingIDs = followingIDs.map(
      (eachUser) => eachUser.following_user_id
    );

    const getTweetIDsQuery = `
    SELECT
        tweet_id
    FROM
        tweet
    WHERE
        user_id IN (${getFollowingIDs});`;
    const tweetIDs = await db.all(getTweetIDsQuery);

    const getTweetIDs = tweetIDs.map((eachUser) => eachUser.tweet_id);

    console.log(getTweetIDs);
    if (getTweetIDs.includes(parseInt(tweetId))) {
      const getLikedUsernamesQuery = `
        SELECT
            user.username AS likes
        FROM
            user
            INNER JOIN like ON user.user_id = like.user_id
        WHERE
            like.tweet_id = ${tweetId};`;
      const getLikedUserNames = await db.all(getLikedUsernamesQuery);
      const likedUserNames = getLikedUserNames.map(
        (eachName) => eachName.likes
      );
      response.send(userNamesList(likedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8
//tweets tweetId replies
const userReplies = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getSelectedUserQuery = `
        SELECT
            user_id
        FROM
            user
        WHERE
            username = '${username}';`;
    const userExistence = await db.get(getSelectedUserQuery);

    const getFollowingUserIDsQuery = `
    SELECT
        following_user_id
    FROM
        follower
    WHERE
        follower_user_id = ${userExistence.user_id};`;
    const followingIDs = await db.all(getFollowingUserIDsQuery);

    const getFollowingIDs = followingIDs.map(
      (eachUser) => eachUser.following_user_id
    );

    const getTweetIDsQuery = `
    SELECT
        tweet_id
    FROM
        tweet
    WHERE
        user_id IN (${getFollowingIDs});`;
    const tweetIDs = await db.all(getTweetIDsQuery);

    const getTweetIDs = tweetIDs.map((eachUser) => eachUser.tweet_id);

    console.log(getTweetIDs);
    if (getTweetIDs.includes(parseInt(tweetId))) {
      const getRepliesQuery = `
        SELECT
            user.name,
            reply.reply
        FROM
            user
            INNER JOIN reply ON user.user_id = reply.user_id
        WHERE
            reply.tweet_id = ${tweetId};`;
      const getReplies = await db.all(getRepliesQuery);
      response.send(userReplies(getReplies));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9
const convertAllTweetsDBObject = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getSelectedUserQuery = `
        SELECT
            user_id
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(getSelectedUserQuery);

  const getAllTweetsQuery = `
        SELECT
            tweet.tweet AS tweet,
            tweet.date_time AS date_time,
            COUNT(like.tweet_id) AS likes,
            COUNT(reply.tweet_id) AS replies
        FROM
            tweet
            INNER JOIN like ON tweet.user_id = like.user_id
            INNER JOIN reply ON tweet.user_id = reply.user_id
        WHERE
            tweet.user_id = ${userExistence.user_id};`;
  const getAllTweets = await db.all(getAllTweetsQuery);

  response.send(
    getAllTweets.map((eachTweet) => convertAllTweetsDBObject(eachTweet))
  );
});

//API-10
//post user tweets
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getSelectedUserQuery = `
        SELECT
            user_id
        FROM
            user
        WHERE
            username = '${username}';`;
  const userExistence = await db.get(getSelectedUserQuery);

  const { tweet } = request.body;

  const currentDate = new Date();

  const postRequestQuery = `
    INSERT INTO
        tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${userExistence.user_id}, '${currentDate}');`;

  const responseResult = await db.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

//API-11
//delete tweets tweetId
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getSelectedUserQuery = `
        SELECT
            user_id
        FROM
            user
        WHERE
            username = '${username}';`;
    const userExistence = await db.get(getSelectedUserQuery);

    const getUserTweetsListQuery = `
        SELECT
            tweet_id
        FROM
            tweet
        WHERE
            user_id=${userExistence.user_id};`;

    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map(
      (eachTweetId) => eachTweetId.tweet_id
    );

    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `
        DELETE FROM
            tweet
        WHERE
            tweet_id= ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
