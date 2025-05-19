DROP TABLE clients;
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  priority INTEGER
);

insert into clients values(1,"Stark, White and Abbott", "Cloned Optimal Architecture", "in-progress", 1);
insert into clients values(2,"Wiza LLC", "Exclusive Bandwidth-Monitored Implementation", "complete", 1);
insert into clients values(3,"Nolan LLC", "Vision-Oriented 4Thgeneration Graphicaluserinterface", "backlog", 1);
insert into clients values(4,"Thompson PLC", "Streamlined Regional Knowledgeuser", "in-progress", 2);
insert into clients values(5,"Walker-Williamson", "Team-Oriented 6Thgeneration Matrix", "in-progress", 3);
insert into clients values(6,"Boehm and Sons", "Automated Systematic Paradigm", "backlog", 2);
insert into clients values(7,"Runolfsson, Hegmann and Block", "Integrated Transitional Strategy", "backlog", 3);
insert into clients values(8,"Schumm-Labadie", "Operative Heuristic Challenge", "backlog", 4);
insert into clients values(9,"Kohler Group", "Re-Contextualized Multi-Tasking Attitude", "backlog", 5);
insert into clients values(10,"Romaguera Inc", "Managed Foreground Toolset", "backlog", 6);
insert into clients values(11,"Reilly-King", "Future-Proofed Interactive Toolset", "complete", 2);
insert into clients values(12,"Emard, Champlin and Runolfsdottir", "Devolved Needs-Based Capability", "backlog", 7);
insert into clients values(13,"Fritsch, Cronin and Wolff", "Open-Source 3Rdgeneration Website", "complete", 3);
insert into clients values(14,"Borer LLC", "Profit-Focused Incremental Orchestration", "backlog", 8);
insert into clients values(15,"Emmerich-Ankunding", "User-Centric Stable Extranet", "in-progress", 4);
insert into clients values(16,"Willms-Abbott", "Progressive Bandwidth-Monitored Access", "in-progress", 5);
insert into clients values(17,"Brekke PLC", "Intuitive User-Facing Customerloyalty", "complete", 4);
insert into clients values(18,"Bins, Toy and Klocko", "Integrated Assymetric Software", "backlog", 9);
insert into clients values(19,"Hodkiewicz-Hayes", "Programmable Systematic Securedline", "backlog", 10);
insert into clients values(20,"Murphy, Lang and Ferry", "Organized Explicit Access", "backlog", 11);