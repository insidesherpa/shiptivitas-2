import request from 'supertest';
import Database from 'better-sqlite3';
import express from 'express';

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

let db;

beforeAll(() => {
	db = new Database(':memory:');

	db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT,
      priority INTEGER
    )
  `);
});

afterAll(() => {
	db.close();
});

beforeEach(() => {
	db.exec('DELETE FROM clients');

	const insert = db.prepare('INSERT INTO clients (id, name, description, status, priority) VALUES (?, ?, ?, ?, ?)');
	insert.run(1, 'Client 1', 'Description 1', 'backlog', 1);
	insert.run(2, 'Client 2', 'Description 2', 'backlog', 2);
	insert.run(3, 'Client 3', 'Description 3', 'in-progress', 1);
	insert.run(4, 'Client 4', 'Description 4', 'in-progress', 2);
	insert.run(5, 'Client 5', 'Description 5', 'complete', 1);
});

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
};

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
};

app.get('/api/v1/clients', (req, res) => {
	const status = req.query.status;
	if (status) {
		if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
			return res.status(400).send({
				'message': 'Invalid status provided.',
				'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
			});
		}
		const clients = db.prepare('select * from clients where status = ?').all(status);
		return res.status(200).send(clients);
	}
	const clients = db.prepare('select * from clients').all();
	return res.status(200).send(clients);
});

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

describe('Client API', () => {
	describe('GET /api/v1/clients', () => {
		it('should return all clients', async () => {
			const response = await request(app).get('/api/v1/clients');
			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(5);
		});

		it('should filter clients by status', async () => {
			const response = await request(app).get('/api/v1/clients?status=in-progress');
			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body.every(c => c.status === 'in-progress')).toBe(true);
		});
	});

	describe('PUT /api/v1/clients/:id', () => {
		describe('Status changes', () => {
			it('should move client to end of new lane when status changes without priority', async () => {
				const response = await request(app)
					.put('/api/v1/clients/1')
					.send({ status: 'complete' });

				expect(response.status).toBe(200);

				const client = response.body.find(c => c.id === 1);
				expect(client.status).toBe('complete');
				expect(client.priority).toBe(2);

				const completeClients = response.body.filter(c => c.status === 'complete');
				expect(completeClients).toHaveLength(2);
			});

			it('should reorder old lane when client moves out', async () => {
				const response = await request(app)
					.put('/api/v1/clients/1')
					.send({ status: 'complete' });

				expect(response.status).toBe(200);

				const backlogClients = response.body.filter(c => c.status === 'backlog');
				expect(backlogClients).toHaveLength(1);
				expect(backlogClients[0].id).toBe(2);
				expect(backlogClients[0].priority).toBe(1);
			});

			it('should insert client at specific priority in new lane', async () => {
				const response = await request(app)
					.put('/api/v1/clients/1')
					.send({ status: 'in-progress', priority: 1 });

				expect(response.status).toBe(200);

				const client = response.body.find(c => c.id === 1);
				expect(client.status).toBe('in-progress');
				expect(client.priority).toBe(1);

				const client3 = response.body.find(c => c.id === 3);
				expect(client3.priority).toBe(2);

				const client4 = response.body.find(c => c.id === 4);
				expect(client4.priority).toBe(3);
			});
		});

		describe('Same-lane reordering', () => {
			it('should move client up in priority within same lane', async () => {
				const response = await request(app)
					.put('/api/v1/clients/4')
					.send({ priority: 1 });

				expect(response.status).toBe(200);

				const client4 = response.body.find(c => c.id === 4);
				expect(client4.priority).toBe(1);
				expect(client4.status).toBe('in-progress');

				const client3 = response.body.find(c => c.id === 3);
				expect(client3.priority).toBe(2);
			});

			it('should move client down in priority within same lane', async () => {
				const response = await request(app)
					.put('/api/v1/clients/3')
					.send({ priority: 2 });

				expect(response.status).toBe(200);

				const client3 = response.body.find(c => c.id === 3);
				expect(client3.priority).toBe(2);

				const client4 = response.body.find(c => c.id === 4);
				expect(client4.priority).toBe(1);
			});
		});

		describe('Edge cases', () => {
			it('should do nothing when status unchanged and no priority provided', async () => {
				const response = await request(app)
					.put('/api/v1/clients/1')
					.send({ status: 'backlog' });

				expect(response.status).toBe(200);

				const client = response.body.find(c => c.id === 1);
				expect(client.status).toBe('backlog');
				expect(client.priority).toBe(1);
			});

			it('should return 400 for invalid status', async () => {
				const response = await request(app)
					.put('/api/v1/clients/1')
					.send({ status: 'invalid-status' });

				expect(response.status).toBe(400);
				expect(response.body.message).toBe('Invalid status provided.');
			});

			it('should return 400 for invalid client id', async () => {
				const response = await request(app)
					.put('/api/v1/clients/999')
					.send({ status: 'complete' });

				expect(response.status).toBe(400);
				expect(response.body.message).toBe('Invalid id provided.');
			});
		});

		describe('Priority uniqueness', () => {
			it('should ensure no duplicate priorities in same status', async () => {
				const response = await request(app)
					.put('/api/v1/clients/2')
					.send({ priority: 1 });

				expect(response.status).toBe(200);

				const backlogClients = response.body.filter(c => c.status === 'backlog');
				const priorities = backlogClients.map(c => c.priority).sort();

				expect(priorities).toEqual([1, 2]);
				expect(new Set(priorities).size).toBe(priorities.length);
			});
		});
	});
});
