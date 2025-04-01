const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Track frequency rooms
const frequencyRooms = {
  channel1: new Set(),
  channel2: new Set(),
  channel3: new Set()
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle joining frequency rooms
  socket.on('joinFrequency', (frequency) => {
    // Validate the frequency room exists
    if (!frequencyRooms[frequency]) {
      console.log(`Invalid frequency: ${frequency}`);
      return;
    }

    // Leave all other frequency rooms first
    Object.keys(frequencyRooms).forEach(room => {
      if (frequencyRooms[room].has(socket.id)) {
        socket.leave(room);
        frequencyRooms[room].delete(socket.id);
      }
    });
    
    // Join the new frequency room
    socket.join(frequency);
    frequencyRooms[frequency].add(socket.id);
    console.log(`User ${socket.id} joined ${frequency}`);
  });

  socket.on('signal', (data) => {
    // Validate data has frequency property
    if (!data || !data.frequency) {
      console.log('Invalid signal data:', data);
      return;
    }
    
    // Broadcast to all in the same frequency room except sender
    socket.to(data.frequency).emit('signal', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove from all frequency rooms
    Object.keys(frequencyRooms).forEach(room => {
      if (frequencyRooms[room].has(socket.id)) {
        frequencyRooms[room].delete(socket.id);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});