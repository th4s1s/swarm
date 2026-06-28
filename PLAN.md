I need you to read my source code audit skill in `/vibe/hack/skill` and write a plan to implement an application to run the source code audit workflow. This plan is used to make the Backend for Source code audit app only. No frontend for now.

You can modify the skill to fit your implementation, for example:
- so that it will knows what the app has already done for it so it doesn't create another duplicate or doing something else.
- it needs to returns data in a specific format so that the backend code can detect it and use it for other operations

Sometime i will accidentally describe how the features work in frontend so if you notice that something i wrote is a frontend handled, feel free to point it out and note it so that after we have successfully finish implementing the core backend, you will write a plan to implement the frontend with the vision that i have described to you.

This prompt will always in `PLAN.md` so that you can always come back and reread it in case you forget so please add this to your memory.

# Architecture

- Language: NodeJS
- DBMS: (you suggest)
- Claude CLI or Claude SDK is your choice after finish reading the features described below

# Features

## Login

Login to get access to the app and store login session. Make sure no unauthorized access to the app.

Creds: `admin/vibhackiscool` 

## Projects

The app will have a feature to create or use existing projects, the projects will be located in `/vibe/hack/projects`.

### Project creation

When choosing to create new project, every project will need:

- project title (used for displaying): to differenciate from the project name used for directory creation and tracking
- project name: this is used for directory creation so limit it to only alphanumeric chars and `-` or `_` only
- project description (optional)
- The source code of the project, there will be 2 option available:
    + The user will give the github/gitlab/any git url (with optional token). You will proceed to clone that git repo with the specified project name to `/vibe/hack/projects/<project name>`
    + The user will upload a zip file. Create a dir `/vibe/hack/projects/<project name>` and extract the zip content there.

After creating the project name dir, create a `<project name>` dir in `/vibe/hack/audits` so that the audit skill can used.

### Project update

For projects created using Git option, detect if the project is created using git allow user to:
- Get a list of all branches/tags so that the user can choose what to checkout to
- Check out a new branch/tag/version of that project to audit on a specific version of that project
- Check for update (new commit/tag/version) of that project and notify the user that the project has new updates (the frontent will ask the user if they and to update), if the user agree, Fetch new commit/version of that project to update the project

For project create using the zip method, allows user to upload new zip to update. The app will delete the old content inside `/vibe/hack/projects/<project name>` and extract new content from the zip there.

### Project management

The app needs to save at least the following information about the projects so that the frontend can dispaly (it can save additional information used internally but not used for display):
- Project title (modifiable)
- Project name (unmodifiable)
- Description (modifiable)
- Git or zip project (unmodifiable)
- Current branch/tag/version and the commit of that branch/tag/version (modifiable, feature to do that is described above)
- List of available sessions (session will be described in later section). Display the session title and session name (session id)
- The live instance note of that project (modifiable)

## Sessions

Every project will have multiple audit sessions. The app will have a feature to create or use existing session, the session will be located in `/vibe/hack/projects/<project name>`.

### Session Creation

When creating a new session, every session will need:
- Session title (used for displaying): to differenciate from the session name used for resuming conversion and tracking
- Description (optional)

The session id created when starting a new conversation with claude cli.
The session name is the `audit-<timestamp>` directory mentioned in the skill, you can auto create this first for the claude agent, when append a prompt to tell claude about this so that it uses the directory as its workspace and not have to get the timestamp and create a new directory again.

### Session Management

The app needs to save at least the following information about the sessions so that the frontend can dispaly (it can save additional information used internally but not used for display):
- The project that the session belong to (unmodifiable)
- Session title (modifiable)
- Session name (unmodifiable)
- Session id (unmodifiable)
- Description (modifiable)
- The resume note
- The agents/workflows that session is running (modifiable or more correctly, stoppable)
- The config: mode, permission, etc. any thing related to claude session config (modifiable)
- The groups and findings of that audit session (unmodifiable). This could be extracted from the audit db created by the skill. What info should be presented and displayed is your choice but keep it as informational as possible and avoid displaying unnecessary info
- List of its "child" sessions (the forked sessions) mentioned in the skill used for verify and report phase. So that the user can switch and view what each session is doing.

### Child (forked) session

Add an option to fork a session, the user needs to input the following info:
- Session title
- Description (optional)

The child session will inherit all the properties mentioned above except for:
- Session id, since claude generate unique id for every session
- The session monitoring streaming so that the info is the same accross all session in that audit session and we only change the view to see which session is doing which job.
- The agents/workflows that session is running
- The config

The child session should also display the report after the report phase has finished running in the forked (child) session and has option for user to copy as markdown.

The child sessions will not be displayed in the project properties, only the root (parent) session is.

### Session Monitoring

Session Monitoring provides a real-time view of an audit session by streaming Claude output into web app terminal in both session and forked session. The app will have 2 view modes for the session monitoring:

1. Terminal View: A human-friendly terminal UI that reconstructs the Claude CLI experience as closely as possible.
- It converts Claude JSON events into a terminal-like interface that visually resembles Claude CLI.
- The goal is to make users feel like they are watching the session directly inside a terminal
- The renderer should parse the structured stream and map events into terminal blocks such as (reference more from claude cli UI/UX):
    + User prompt
    + Assistant response
    + Tool call start
    + Tool call output
    + Tool call error
    + Thinking/progress status
    + Command execution
    + File edit summary
    + Session completion
    + Session failure

2. JSON View: A raw structured stream viewer that displays the default JSON events exactly as received.

This allows users to monitor long-running audit sessions in real time while also keeping access to the original machine-readable event stream for debugging, replay, and analysis.

### Running session

Next to the Session Monitoring screen is options where you can choose which of the 6 phases or 2 "full" or "source" mode to run for the current prompt.

Below the Session Monitoring screen is a box to fill your custom prompt to append to that run phase/mode.

You can choose not to select any phase/mode and just type in the custom prompt box or vice versa.

These option can be used to queue or steer the current running flow of the agent.

## MCP

The app also need to display what mcp server is currently registered globally and per-project/directory and have option to add/modify/delete mcp servers

## Quota Tracker

Check the current usage of claude account and the remaining quota for the month. This tool helps you monitor your usage and avoid exceeding your limits. Reference on [9router](https://github.com/decolua/9router)

Show account email, current session, weekly, resets

## Usage

Monitor your API usage, token consumption. Reference on [9router](https://github.com/decolua/9router)

- Total tokens, input, output, cost
- Tokens/Cost graph
- Table of each project, search audit session of that project
- Usage by model

## Resources

Monitor all images and container such as docker.desktop include UI/UX.
- Images: show total images, total size used, search. Table include:  Name | Tag | Image ID | Created | Size | Actions(Delete)
- Containers: show total containers; total cpu, memory usage; search. Table include: Name | Container ID | Image | Status | Port(s) | CPU(%) | Memory usage/limit | PIDS | Last started | Actions(Start/Stop/Restart, Delete)
- Network traffic: netin/netout in graph
- Disk IO: disk read/write in graph

Images and containers can search and have a tick box for multiple delete; filter by name, status(in use, unused)

## Config

Change environment variables, default settings, and other configurations for the app.