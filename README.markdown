## Shiptivity API server

Here is a node js application using Express

To run the application make sure you have node installed

Once you have clone the repo, run:
### npm install
to install all dependencies

Start the server by running:
### npm start
This command will run the Express server on localhost:3001

Try the API by running:
### curl -X GET http://localhost:3001/api/v1/clients
### curl -X GET http://localhost:3001/api/v1/clients?status=backlog
### curl -X GET http://localhost:3001/api/v1/clients/1
### curl -X PUT http://localhost:3001/api/v1/clients/1 -H "Content-Type: application/json" -d '{"status":"in-progress", "priority": 6}'

For this task, you only need to update the API for updating client detail. You do not have to save the data back to db.txt

Valid status:
- backlog
- in-progress
- complete

`client.priority` should be unique per status. Ordered from 1 to x where priority 1 means most important client.