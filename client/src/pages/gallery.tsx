import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Image as ImageIcon, Video as VideoIcon, Sparkles, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import type { Generation } from '@shared/schema';

export default function GalleryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const { data: generations = [], isLoading, error } = useQuery<Generation[]>({
    queryKey: ['/api/generations'],
    enabled: !!user,
  });

  if (!user) return null;

  // Filter generations based on active tab
  const filteredGenerations = generations.filter(gen => {
    if (activeTab === 'all') return true;
    if (activeTab === 'images') return gen.type === 'text-to-image' || gen.type === 'image-to-image';
    if (activeTab === 'videos') return gen.type === 'image-to-video';
    if (activeTab === 'upscales') return gen.type === 'upscale';
    if (activeTab === 'failed') return gen.status === 'failed';
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30" data-testid={`badge-status-completed`}>Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30" data-testid={`badge-status-pending`}>Pending</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid={`badge-status-processing`}>Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive" data-testid={`badge-status-failed`}>Failed</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    if (type === 'image-to-video') return <VideoIcon className="h-4 w-4" />;
    if (type === 'upscale') return <Sparkles className="h-4 w-4" />;
    return <ImageIcon className="h-4 w-4" />;
  };

  const getTypeLabel = (type: string) => {
    if (type === 'text-to-image') return 'Text to Image';
    if (type === 'image-to-image') return 'Image to Image';
    if (type === 'image-to-video') return 'Image to Video';
    if (type === 'upscale') return 'Upscale';
    return type;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8 animate-slide-up">
          <h1 className="text-4xl font-bold mb-2">
            <span className="bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">Gallery</span>
          </h1>
          <p className="text-muted-foreground text-lg">View all your generated content</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid w-full grid-cols-5" data-testid="tabs-gallery-filter">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="images" data-testid="tab-images">Images</TabsTrigger>
            <TabsTrigger value="videos" data-testid="tab-videos">Videos</TabsTrigger>
            <TabsTrigger value="upscales" data-testid="tab-upscales">Upscales</TabsTrigger>
            <TabsTrigger value="failed" data-testid="tab-failed">Failed</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {error ? (
              <div className="text-center py-20">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2" data-testid="text-error">Failed to load gallery</h3>
                <p className="text-muted-foreground">Please try refreshing the page</p>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" data-testid="loading-spinner" />
              </div>
            ) : filteredGenerations.length === 0 ? (
              <div className="text-center py-20">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2" data-testid="text-empty-state">No generations found</h3>
                <p className="text-muted-foreground">
                  {activeTab === 'failed' 
                    ? 'No failed generations' 
                    : 'Start creating to see your generations here'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGenerations.map((gen) => (
                  <Card 
                    key={gen.id} 
                    className={`overflow-hidden group ${(gen.status === 'completed' && gen.fileUrl) || gen.status === 'failed' ? 'hover-elevate cursor-pointer' : ''}`}
                    onClick={() => {
                      if (gen.status === 'completed' && gen.fileUrl) {
                        setSelectedGeneration(gen);
                      } else if (gen.status === 'failed') {
                        setSelectedGeneration(gen);
                      }
                    }}
                    data-testid={`card-generation-${gen.id}`}
                  >
                    <div className="aspect-square bg-muted relative">
                      {gen.status === 'completed' && gen.fileUrl ? (
                        gen.type === 'image-to-video' ? (
                          <video 
                            src={gen.fileUrl!} 
                            className="w-full h-full object-cover"
                            muted
                            data-testid={`video-preview-${gen.id}`}
                          />
                        ) : (
                          <img 
                            src={gen.fileUrl!} 
                            alt={gen.prompt}
                            className="w-full h-full object-cover"
                            data-testid={`img-preview-${gen.id}`}
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {gen.status === 'failed' ? (
                            <AlertCircle className="h-12 w-12 text-destructive" data-testid={`icon-failed-${gen.id}`} />
                          ) : (
                            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" data-testid={`spinner-${gen.id}`} />
                          )}
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-2">
                        {getStatusBadge(gen.status)}
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {getTypeIcon(gen.type)}
                        <span className="text-sm font-medium" data-testid={`text-type-${gen.id}`}>{getTypeLabel(gen.type)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-prompt-${gen.id}`}>
                        {gen.prompt}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2" data-testid={`text-date-${gen.id}`}>
                        {new Date(gen.createdAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Modal viewer */}
      <Dialog open={!!selectedGeneration} onOpenChange={() => setSelectedGeneration(null)}>
        <DialogContent className="max-w-4xl" data-testid="dialog-generation-viewer">
          {selectedGeneration && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getTypeIcon(selectedGeneration.type)}
                  {getTypeLabel(selectedGeneration.type)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {selectedGeneration.status === 'completed' && selectedGeneration.fileUrl ? (
                  <div className="rounded-lg overflow-hidden bg-muted">
                    {selectedGeneration.type === 'image-to-video' ? (
                      <video 
                        src={selectedGeneration.fileUrl!} 
                        className="w-full"
                        controls
                        autoPlay
                        loop
                        data-testid="video-full"
                      />
                    ) : (
                      <img 
                        src={selectedGeneration.fileUrl!} 
                        alt={selectedGeneration.prompt}
                        className="w-full"
                        data-testid="img-full"
                      />
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                    {selectedGeneration.status === 'failed' ? (
                      <div className="text-center">
                        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Generation failed</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{selectedGeneration.status}...</p>
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <h4 className="text-sm font-medium mb-1">Prompt</h4>
                  <p className="text-sm text-muted-foreground" data-testid="text-modal-prompt">{selectedGeneration.prompt}</p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    {getStatusBadge(selectedGeneration.status)}
                  </div>
                  {selectedGeneration.status === 'completed' && selectedGeneration.fileUrl && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        try {
                          const link = document.createElement('a');
                          link.href = `/api/download/${selectedGeneration.id}`;
                          link.download = `vivid-vixen-${selectedGeneration.type}-${selectedGeneration.id}.${selectedGeneration.type === 'image-to-video' ? 'mp4' : 'png'}`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          
                          toast({
                            title: 'Download started',
                            description: 'Your file is being downloaded',
                          });
                        } catch (error: any) {
                          toast({
                            title: 'Download failed',
                            description: error.message || 'Unable to download file',
                            variant: 'destructive',
                          });
                        }
                      }}
                      data-testid="button-download"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
