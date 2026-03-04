import { useChat } from '@/context/ChatContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getStatusColor } from '@/lib/utils';
import { Phone, Video, MoreVertical, ArrowLeft } from 'lucide-react';

export function ChatHeader() {
  const { selectedChat, selectChat, startCall, isTyping } = useChat();

  if (!selectedChat) {
    return (
      <div className="h-[72px] border-b border-border flex items-center justify-center bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <p className="text-muted-foreground font-medium">Select a contact to start chatting</p>
      </div>
    );
  }

  const typing = isTyping[selectedChat.id];

  return (
    <div className="h-[72px] px-6 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-sm transition-colors duration-200">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={() => selectChat(null)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="relative shadow-sm rounded-full">
          <Avatar className="h-11 w-11 border border-border/50">
            <AvatarImage src={selectedChat.avatar} />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-medium">
              {selectedChat.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(selectedChat.status)}`} />
        </div>

        <div>
          <h3 className="font-semibold text-foreground text-lg leading-tight">{selectedChat.name}</h3>
          <p className="text-sm font-medium leading-tight">
            {typing ? (
              <span className="text-primary flex items-center gap-1">
                <span>typing</span>
                <span className="flex gap-0.5 items-end">
                  <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </span>
            ) : (
              <span className={selectedChat.status === 'online' ? 'text-green-500 dark:text-green-400' : 'text-muted-foreground'}>
                {selectedChat.status === 'online' ? 'Online' : 'Offline'}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
          onClick={() => startCall('audio')}
          title="Voice call"
        >
          <Phone className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
          onClick={() => startCall('video')}
          title="Video call"
        >
          <Video className="w-5 h-5" />
        </Button>
        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
        >
          <MoreVertical className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
