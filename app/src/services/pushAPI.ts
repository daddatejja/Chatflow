import api from './api';

export const pushAPI = {
  getVapidKey: () => api.get('/push/vapid-key'),
  subscribe: (subscription: PushSubscription) => 
    api.post('/push/subscribe', { subscription }),
  unsubscribe: (endpoint: string) => 
    api.post('/push/unsubscribe', { endpoint })
};
