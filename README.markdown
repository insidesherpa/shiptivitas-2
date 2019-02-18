<p align="center">
<a href="https://www.insidesherpa.com/virtual-internships/prototype/oRMogWRHeewqHzA7u/College%20Students%3A%20Learn%20how%20to%20work%20at%20a%20YC%20startup">
<img src="https://s3-ap-southeast-2.amazonaws.com/insidesherpa-assets/yc/yc-blade.png"></a>
<br><br>
  <a href="https://www.insidesherpa.com/virtual-internships/prototype/oRMogWRHeewqHzA7u/College%20Students%3A%20Learn%20how%20to%20work%20at%20a%20YC%20startup">
  <img src="https://s3-ap-southeast-2.amazonaws.com/insidesherpa-assets/yc/workatastartup_logo_orange-c2a27f6374f9395166ee9906e2e0873af835b3c6132ae6aa0543582298567041.svg"></a>
</p>


<p align='center'> 
  <b><a href="#task"> Task Overview</a></b>
  | 
  <b><a href="#installation"> Installation </a></b>
  |
  <b><a href="https://www.insidesherpa.com/modules/oRMogWRHeewqHzA7u/9btzxEJz5aDBhNHMv"> Link to Module 2 </a></b>
  |
  <b><a href="https://www.insidesherpa.com/virtual-internships/prototype/oRMogWRHeewqHzA7u/College%20Students%3A%20Learn%20how%20to%20work%20at%20a%20YC%20startup" target="_blank"> Link to Y Combinator Program </a></b>
           
</p>


# Introduction 
<p> 
<b> College Students: 
  Learn how to work at a Y Combinator startup </b>
<br>Train online for the skills Y Combinator startups are looking for. One of the official ways to get recruited into a Y Combinator startup.
</p>

<h2 id="task">Module 2 Task Overview</h2>
<b> Working Fullstack 2: </b> Backend updates for new features.
Implement the backend changes for the new productivity tool.
<br><br>
<b> Aim: </b> 
Your task is to take the latest version of the Shiptivitas app and now tie it to the NodeJS backend.
In the backend, what you need to do is write a few functions that take the user event on the frontend and then save it to your database.
<br><br>

Acceptance Criteria
<ul>
  <li>When a user moves a card from one swimlane to another, the database updates the position of the client accordingly.</li>
  <li>When a user rearranges a card in the same swimlane, the database updates the position of the client accordingly.</li>
  <li>When a user refreshes the page, the cards position and order should remain in the same spot as before.</li>
  
</ul>

<h2 id="installation"> Installation </h2>

<ol>
  <li>Clone the Shiptivity frontend repository </li>
  <li> Make the necessary changes to the code. <br>
    <i>note: this app does not require any user auth systems or permission levels yet</i></li>
  
</ol>

## Shiptivity API server

This is a node js application using Express

To run the application make sure you have node installed.

Once you have cloned the repo, run:
<code> npm install </code>
to install all dependencies

Start the server by running:
<code> npm start </code>
This command will run the Express server on localhost:3001

Try the API by running:
### curl -X GET http://localhost:3001/api/v1/clients
### curl -X GET http://localhost:3001/api/v1/clients?status=backlog
### curl -X GET http://localhost:3001/api/v1/clients/1
### curl -X PUT http://localhost:3001/api/v1/clients/1 -H "Content-Type: application/json" -d '{"status":"in-progress", "priority": 6}'


For this task, you only need to update the API for updating client detail.

Valid status:
- backlog
- in-progress
- complete

`client.priority` should be unique per status. Ordered from 1 to x where priority 1 means most important client.

Some sample curl to help you test your code (make sure you restart your server each time you run this):

Should do nothing

### curl -X PUT http://localhost:3001/api/v1/clients/1 -H "Content-Type: application/json" -d '{"status":"in-progress"}'

Should insert the client as lowest priority (biggest number) with status complete

### curl -X PUT http://localhost:3001/api/v1/clients/1 -H "Content-Type: application/json" -d '{"status":"complete"}'

Should insert the client at the right priority and reorder the priority in clients with different statuses

### curl -X PUT http://localhost:3001/api/v1/clients/1 -H "Content-Type: application/json" -d '{"status":"complete", "priority": 3}'

## Additional Resources
Node JS: https://nodejs.org/en/
Express: https://expressjs.com
better-sqlite3: https://github.com/JoshuaWise/better-sqlite3/blob/HEAD/docs/api.md
