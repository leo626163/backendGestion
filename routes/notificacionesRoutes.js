const express = require('express');
const router = express.Router();
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount
} = require('../controllers/notificationController');

const { protect } = require('../middleware/authMiddleware');

// Rutas
router.get('/', protect, getUserNotifications);
router.patch('/:id/read', protect, markAsRead);
router.patch('/mark-all-read', protect, markAllAsRead);
router.get('/unread-count', protect, getUnreadCount);

module.exports = router;