const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174']
}
app.use(cors(corsOptions))
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iepmiic.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection


        const advocatesCollection = client.db("Ukil").collection("advocates");
        const usersCollection = client.db("Ukil").collection("users");
        const caseRequestsCollection = client.db("Ukil").collection("caseRequests");
        const articlesCollection = client.db("Ukil").collection("articles");

        const SECRET_KEY = process.env.SECRET_KEY;

        // middleware
        const verifyToken = (req, res, next) => {
            // console.log('inside verify', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized access!' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, SECRET_KEY, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized access!' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // Register Advocate
        app.post('/advocate', async (req, res) => {
            const advocate = req.body;

            const query = { email: advocate.email };
            const existingAdvocate = await advocatesCollection.findOne(query);
            if (existingAdvocate) {
                return res.send({ message: 'advocate already exist!', insertedId: null })
            }

            const salt = await bcrypt.genSalt(10)
            const securePassword = await bcrypt.hash(req.body.password, salt)

            const advocateInfo = {
                name: req.body.name,
                email: req.body.email,
                address: req.body.address,
                court: req.body.court,
                number: req.body.number,
                license: req.body.license,
                yearOfPractice: req.body.yearOfPractice,
                chamber: req.body.chamber,
                practiceArea: req.body.practiceArea,
                eduQualification: req.body.eduQualification,
                university: req.body.university,
                graduationYear: req.body.graduationYear,
                password: securePassword,
            }
            const result = await advocatesCollection.insertOne(advocateInfo);

            res.send(result);
        })

        // Register User
        app.post('/user', async (req, res) => {
            const user = req.body;

            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist!', insertedId: null })
            }

            const salt = await bcrypt.genSalt(10)
            const securePassword = await bcrypt.hash(req.body.password, salt)

            const userInfo = {
                name: req.body.name,
                email: req.body.email,
                number: req.body.number,
                password: securePassword,
            }
            const result = await usersCollection.insertOne(userInfo);

            res.send(result);
        })


        // Login API
        app.post('/login', async (req, res) => {
            const { email, password, userType } = req.body;

            // console.log('email, pin, userType', email, password, userType);

            const query = { email: email };
            let user = {};

            if (userType == 'Advocate') {
                user = await advocatesCollection.findOne(query);
            }
            else {
                user = await usersCollection.findOne(query);
            }


            if (user) {
                const isPinValid = await bcrypt.compare(password, user.password);
                if (isPinValid) {
                    // console.log('User exists:', user);

                    const token = jwt.sign({ email: user.email }, SECRET_KEY, { expiresIn: '1h' });
                    res.json({ token, user });


                    // return res.send({ user: true, pin: true, type: user.type });
                } else {
                    console.log('Invalid pin');
                    return res.send({ user: true, pin: false });
                }
            } else {
                console.log('User does not exist');
                return res.send({ user: false });
            }

        })

        // Advocate info by email
        app.get('/advocate', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { email: email };

            const advocate = await advocatesCollection.findOne(query);

            const requestsQuery = { advocateId: advocate._id.toString() };

            const caseRequests = await caseRequestsCollection
                .find(requestsQuery)
                .sort({ requestedAt: -1 }) // Sort by latest requestedAt
                .toArray();

            // const requestsQuery = { advocateId: advocate._id.toString() };

            const articles = await articlesCollection
                .find(query)
                .sort({ postedAt: -1 }) // Sort by latest requestedAt
                .toArray();



            res.status(200).json({ advocate, caseRequests, articles });
        })

        // Advocate Detail by Id for User
        app.get('/advocateDetail', async (req, res) => {
            const id = req.query.id;
            const query = { _id: new ObjectId(id) };

            const advocate = await advocatesCollection.findOne(query);

            const articlesQuery = { advocateId: id };
            const articles = await articlesCollection
                .find(articlesQuery)
                .sort({ postedAt: -1 }) // Sort by latest requestedAt
                .toArray();

            res.send({ advocate, articles });
        })


        app.get('/user', verifyToken, async (req, res) => {
            try {
                const userEmail = req.query.email;
                const query = { email: userEmail };

                const user = await usersCollection.findOne(query);

                // Aggregate pipeline to fetch user requests and advocate names
                const userRequests = await caseRequestsCollection.aggregate([
                    {
                        $match: { email: userEmail } // Match requests by user email
                    },
                    {
                        $sort: { requestedAt: -1 } // Sort by the latest requestedAt
                    },
                    {
                        $addFields: {
                            advocateIdAsObjectId: { $toObjectId: "$advocateId" } // Convert string advocateId to ObjectId
                        }
                    },
                    {
                        $lookup: {
                            from: 'advocates', // Collection to join
                            localField: 'advocateIdAsObjectId', // Converted ObjectId field
                            foreignField: '_id', // Advocate collection's _id
                            as: 'advocateDetails' // Output array field
                        }
                    },
                    {
                        $unwind: {
                            path: '$advocateDetails',
                            preserveNullAndEmptyArrays: true // Include requests even if no advocate is found
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1,
                            advocateId: 1,
                            heading: 1,
                            message: 1,
                            requestedAt: 1,
                            status: 1,
                            advocateName: { $ifNull: ['$advocateDetails.name', 'Unknown Advocate'] },
                            advocateImage: { $ifNull: ['$advocateDetails.image', 'No img'] },
                        }
                    }
                ]).toArray();

                if (!userRequests.length) {
                    return res.status(404).json({ message: 'No requests found for this user' });
                }

                res.status(200).json({ user, userRequests });
            } catch (error) {
                console.error("Error fetching user requests with advocates:", error);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        });


        // Get Advocates
        app.get('/advocates', async (req, res) => {
            try {
                const { selectedCourt, selectedField } = req.query;
                // console.log(city, practiceArea);

                // Build the query object

                // if (search) {
                //     query.$or = [
                //         { ProductName: { $regex: search, $options: 'i' } },
                //         { description: { $regex: search, $options: 'i' } }
                //     ];
                // }

                let query = {};
                if (selectedCourt != "All") {
                    query.court = selectedCourt; // Direct match for a single brand
                }

                if (selectedField != "All") {
                    query.practiceArea = selectedField; // Direct match for a single category
                }


                // Fetch products from MongoDB based on the query
                const advocates = await advocatesCollection.find(query).toArray();
                // console.log('advocates=', advocates);
                const count = advocates.length;

                // const page = parseInt(currentPage);
                const result = await advocatesCollection.find(query).toArray();

                // console.log('advocates=', result);

                res.send({ count, advocates: result });
            } catch (error) {
                res.status(500).json({ error: 'Internal Server Error' });
                // console.log('does not hit');
            }
        });


        // Post Case Request
        app.post('/caseRequest', async (req, res) => {
            const requestInfo = req.body;
            requestInfo.requestedAt = new Date();
            requestInfo.status = "Pending";
            const result = await caseRequestsCollection.insertOne(requestInfo);

            res.send(result);
        })

        // Post Articles
        app.post('/article', async (req, res) => {
            const articleDoc = req.body;
            articleDoc.postedAt = new Date();
            const result = await articlesCollection.insertOne(articleDoc);

            res.send(result);
        })


        // Get All Articles
        app.get('/articles', async (req, res) => {
            const articles = await articlesCollection.find().toArray();

            res.send({ articles });
        })




        // Advocates from diff areas based on experience for the home page
        app.get('/advocates-by-practice-area', async (req, res) => {
            try {
                // Define the practice areas
                const practiceAreas = ['Criminal Lawyer', 'Civil Lawyer', 'Family Lawyer', 'Corporate Lawyer'];

                // Use $facet to fetch 3 advocates per practice area
                const result = await advocatesCollection.aggregate([
                    {
                        $facet: {
                            Criminal_Lawyer: [
                                { $match: { practiceArea: 'Criminal Lawyer' } },
                                { $sort: { yearOfPractice: -1 } }, // Sort by yearOfPractice or any other criteria
                                { $limit: 3 }
                            ],
                            Civil_Lawyer: [
                                { $match: { practiceArea: 'Civil Lawyer' } },
                                { $sort: { yearOfPractice: -1 } },
                                { $limit: 3 }
                            ],
                            Family_Lawyer: [
                                { $match: { practiceArea: 'Family Lawyer' } },
                                { $sort: { yearOfPractice: -1 } },
                                { $limit: 3 }
                            ],
                            Corporate_Lawyer: [
                                { $match: { practiceArea: 'Corporate Lawyer' } },
                                { $sort: { yearOfPractice: -1 } },
                                { $limit: 3 }
                            ]
                        }
                    }
                ]).toArray();

                res.status(200).json(result[0]); // Send the first document from the array
            } catch (error) {
                console.error("Error fetching advocates by practice area:", error);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        });





        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Ukil-server is on');
})

app.listen(port, () => {
    console.log(`Ukil-server is on port ${port}`);
})