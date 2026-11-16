# Recent projects

Orders the sidebar by what you touched last.

## What it does

Pinned workspaces appear in their own section at the top. Below it, projects are ordered by their
most recently active workspace, and each project lists its workspaces underneath. The menu above the
list switches project order between recent activity, last prompt, and name, and workspace order
between creation time, last prompt, and recent activity. Each project collapses independently.

Rows show a status indicator: a spinner while an agent runs, a warning icon while it waits on input,
and a colored dot for needs input, failed, done, and idle. The active row and hovered rows are
highlighted.

Hovering a row on desktop, or using any compact or native layout, reveals an actions button with
pin, rename, copy path, and archive.

## How it works

The view uses Paseo's sidebar view API. It reads workspace, project, and host snapshots from the
connected daemon and keeps its display preferences on the device. It makes no network requests of
its own.

## Setup

Paseo 0.16 or newer on both the daemon and the app. Plugins must be enabled on the daemon, and the
view is picked per device under Settings → Sidebar. The plugin works on iOS, Android, web, and the
desktop app.

## Limitations

Background workspaces are hidden until you enable them in the view's options, as in the built-in
sidebar. The view has no project icons, relative timestamps, project context menus, drag reordering,
host or status filters, or keyboard navigation yet. Project order by recent activity responds to
agent state changes, so a project moves when one of its workspaces changes state, not only when you
send a prompt.
