import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}
	next();
});

app.get('/', (req, res) => {
	return res.status(200).send({ 'message': 'SHIPTIVITY API. Read documentation to see API docs' });
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
	if (Number.isNaN(id)) {
		return {
			valid: false,
			messageObj: {
				'message': 'Invalid id provided.',
				'long_message': 'Id can only be integer.',
			},
		};
	}
	const client = db.prepare('select * from clients where id = ? limit 1').get(id);
	if (!client) {
		return {
			valid: false,
			messageObj: {
				'message': 'Invalid id provided.',
				'long_message': 'Cannot find client with that id.',
			},
		};
	}
	return {
		valid: true,
	};
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
	if (Number.isNaN(priority)) {
		return {
			valid: false,
			messageObj: {
				'message': 'Invalid priority provided.',
				'long_message': 'Priority can only be positive integer.',
			},
		};
	}
	return {
		valid: true,
	}
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
	const status = req.query.status;
	if (status) {
		// status can only be either 'backlog' | 'in-progress' | 'complete'
		if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
			return res.status(400).send({
				'message': 'Invalid status provided.',
				'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
			});
		}
		const clients = db.prepare('select * from clients where status = ?').all(status);
		return res.status(200).send(clients);
	}
	const statement = db.prepare('select * from clients');
	const clients = statement.all();
	return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
	const id = parseInt(req.params.id, 10);
	const { valid, messageObj } = validateId(id);
	if (!valid) {
		res.status(400).send(messageObj);
	}
	return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
	const id = parseInt(req.params.id, 10);
	const { valid, messageObj } = validateId(id);
	if (!valid) {
		return res.status(400).send(messageObj);
	}

	let { status, priority } = req.body;
	const client = db.prepare('select * from clients where id = ?').get(id);

	const validStatuses = ['backlog', 'in-progress', 'complete'];
	if (status && !validStatuses.includes(status)) {
		return res.status(400).send({
			'message': 'Invalid status provided.',
			'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
		});
	}

	if (priority !== undefined) {
		priority = parseInt(priority, 10);
		const { valid: priorityValid, messageObj: priorityMsg } = validatePriority(priority);
		if (!priorityValid) {
			return res.status(400).send(priorityMsg);
		}
	}

	const oldStatus = client.status;
	const oldPriority = client.priority;
	const newStatus = status || oldStatus;

	if (newStatus === oldStatus && priority === undefined) {
		const clients = db.prepare('select * from clients').all();
		return res.status(200).send(clients);
	}

	const statusChanged = newStatus !== oldStatus;

	const clientsInOldStatus = db.prepare('select * from clients where status = ? order by priority').all(oldStatus);
	const clientsInNewStatus = statusChanged
		? db.prepare('select * from clients where status = ? order by priority').all(newStatus)
		: clientsInOldStatus;

	const updateStmt = db.prepare('update clients set status = ?, priority = ? where id = ?');

	const transaction = db.transaction(() => {
		if (statusChanged) {
			for (const c of clientsInOldStatus) {
				if (c.id !== id && c.priority > oldPriority) {
					updateStmt.run(c.status, c.priority - 1, c.id);
				}
			}

			const maxPriority = clientsInNewStatus.length > 0
				? Math.max(...clientsInNewStatus.map(c => c.priority))
				: 0;

			let newPriority;
			if (priority !== undefined) {
				newPriority = Math.min(priority, maxPriority + 1);
				newPriority = Math.max(1, newPriority);

				for (const c of clientsInNewStatus) {
					if (c.priority >= newPriority) {
						updateStmt.run(c.status, c.priority + 1, c.id);
					}
				}
			} else {
				newPriority = maxPriority + 1;
			}

			updateStmt.run(newStatus, newPriority, id);
		} else {
			if (priority === oldPriority) {
				return;
			}

			const maxPriority = clientsInOldStatus.length;
			let newPriority = Math.min(priority, maxPriority);
			newPriority = Math.max(1, newPriority);

			if (newPriority < oldPriority) {
				for (const c of clientsInOldStatus) {
					if (c.id !== id && c.priority >= newPriority && c.priority < oldPriority) {
						updateStmt.run(c.status, c.priority + 1, c.id);
					}
				}
			} else {
				for (const c of clientsInOldStatus) {
					if (c.id !== id && c.priority > oldPriority && c.priority <= newPriority) {
						updateStmt.run(c.status, c.priority - 1, c.id);
					}
				}
			}

			updateStmt.run(newStatus, newPriority, id);
		}
	});

	transaction();

	const clients = db.prepare('select * from clients').all();
	return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);
