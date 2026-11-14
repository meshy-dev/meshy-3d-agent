# Chats that show images or web pages

Shared by the generation and print workflows. Read this only when your chat can show more than
text: images inline in your messages, or a web page in a panel you can open beside the chat
(desktop and IDE agent apps). In a terminal, skip it; the handover in
[delivery.md](delivery.md) is complete without it.

## Images inline

Where your messages render Markdown images from local files, show a rendered preview, or a
reference image the user has to approve, as an image: a Markdown image whose target is the
file's absolute path. A path in backticks or a plain link shows the user nothing. Where images
do not render, name the path instead.

## The model, in a viewer beside the chat

`meshy view` shows a local GLB or glTF in an interactive viewer page. It is free and
uploads nothing:

```bash
meshy view "OUTPUT_FILE" --detach --no-open --format json --no-update-check
```

It returns at once with `result.url` (`http://127.0.0.1:PORT/`). A background process serves
that one model, and for a glTF the buffers and textures in its folder, on 127.0.0.1 only, and
stops after 30 minutes without a request.

- When you have a browser tool that opens a page in a panel beside the chat, run it after the
  handover and open `result.url` there. Tell the user they can orbit and zoom the model.
- Without such a panel, do not open a browser yourself: `--no-open` keeps the user's own browser
  closed. The handover already says `meshy view` can open the model on their computer.
- It shows GLB and glTF only. For an FBX, OBJ, STL, 3MF or USDZ delivery, view a GLB from the same
  job when one was delivered, and never download or convert a file just to view it.
- Run it once per model. Opening the same `result.url` again reuses the running server.
