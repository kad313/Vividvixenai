import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Image, ArrowUpCircle, Upload, Download, X, Video, User, Lock } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import Header from './Header';
import LowCreditsModal from './LowCreditsModal';
import GenerationErrorModal from './GenerationErrorModal';

export default function Generate() {
  const { user, refreshUser, updateCredits } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('image');
  const [prompt, setPrompt] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [showLowCreditsModal, setShowLowCreditsModal] = useState(false);
  const [showGenerationErrorModal, setShowGenerationErrorModal] = useState(false);

  if (!user) return null;

  // Poll for generation status
  useEffect(() => {
    if (!generationId || generationStatus === 'completed' || generationStatus === 'failed') {
      return;
    }

    // Video generation takes longer, so poll less frequently (5s instead of 2s)
    const pollIntervalMs = activeTab === 'video' ? 5000 : 2000;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/generations', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          console.error('Failed to fetch generations:', response.status);
          return;
        }
        
        const generations = await response.json();
        const current = generations.find((g: any) => g.id === generationId);
        
        if (current) {
          setGenerationStatus(current.status);
          
          if (current.status === 'completed' && current.fileUrl) {
            setGeneratedContent(current.fileUrl);
            setIsGenerating(false);
            clearInterval(pollInterval);
            toast({
              title: 'Generation complete!',
              description: `Your ${activeTab} has been generated successfully`,
            });
          } else if (current.status === 'failed') {
            setIsGenerating(false);
            setGenerationId(null);
            setGenerationStatus('');
            clearInterval(pollInterval);
            toast({
              title: 'Generation failed',
              description: 'The AI service encountered an error. Please try again with a different prompt.',
              variant: 'destructive',
            });
            
            // Refresh user data in case credits were refunded
            await refreshUser();
          }
        }
      } catch (error) {
        console.error('Error polling generation status:', error);
      }
    }, pollIntervalMs);

    return () => clearInterval(pollInterval);
  }, [generationId, generationStatus, activeTab, toast]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      console.log('File uploaded:', file.name);
    }
  };

  // Convert file to base64 data URI
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleGenerate = async () => {
    // Validate input first before any error modals
    if (activeTab !== 'upscale' && !prompt) {
      toast({
        title: 'Missing prompt',
        description: 'Please provide a prompt for generation',
        variant: 'destructive',
      });
      return;
    }

    // Image generation now requires a reference image for img2img
    if (activeTab === 'image' && !uploadedFile) {
      toast({
        title: 'Missing reference image',
        description: 'NSFW image generation requires a reference image. Please upload an image first.',
        variant: 'destructive',
      });
      return;
    }

    if (activeTab === 'upscale' && !uploadedFile) {
      toast({
        title: 'Missing file',
        description: 'Please upload an image to upscale',
        variant: 'destructive',
      });
      return;
    }

    // TEMPORARILY DISABLED: Generation blocking for testing
    // Check if user has already seen the initial traffic modal
    // const hasSeenTrafficModal = sessionStorage.getItem('traffic_modal_seen');
    
    // If they've already claimed the initial bonus, show the generation error modal
    // if (hasSeenTrafficModal) {
    //   setShowGenerationErrorModal(true);
    //   return;
    // }

    if (user.credits <= 0) {
      setShowLowCreditsModal(true);
      return;
    }

    try {
      setIsGenerating(true);
      setGeneratedContent(null);
      setGenerationId(null);
      setGenerationStatus('');

      // Convert uploaded file to base64 for upscale, image reference, and video reference
      let fileUrl = undefined;
      if (uploadedFile && (activeTab === 'upscale' || activeTab === 'image' || activeTab === 'video')) {
        fileUrl = await fileToBase64(uploadedFile);
      }

      // Call backend API to start generation
      const response = await apiRequest('POST', '/api/generate', {
        type: activeTab,
        prompt: activeTab !== 'upscale' ? prompt : undefined,
        fileUrl: fileUrl,
      });

      const data = await response.json();
      
      if (data.id) {
        setGenerationId(data.id);
        setGenerationStatus('processing');
        
        // Immediately update credits from response for instant UI feedback
        if (typeof data.credits === 'number') {
          updateCredits(data.credits);
        }
        
        // Also refresh user data as backup
        await refreshUser();
        
        toast({
          title: 'Generation started',
          description: 'Your content is being generated. This may take a few moments...',
        });
      }
    } catch (error: any) {
      setIsGenerating(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start generation',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = () => {
    if (generatedContent && generationId) {
      // Use proxy endpoint for secure cross-origin downloads
      const link = document.createElement('a');
      link.href = `/api/download/${generationId}`;
      const fileExtension = activeTab === 'video' ? 'mp4' : 'png';
      link.download = `vivid-vixen-${activeTab}-${generationId}.${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: 'Download started',
        description: 'Your file is being downloaded',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8 animate-slide-up">
          <h1 className="text-4xl font-bold mb-2">
            <span className="bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">Generate</span>
          </h1>
          <p className="text-muted-foreground text-lg">Create amazing content with AI</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-fade-in">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="image" className="gap-2" data-testid="tab-image">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">NSFW Image</span>
              <span className="sm:hidden">Image</span>
            </TabsTrigger>
            <TabsTrigger value="video" className="gap-2" data-testid="tab-video">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">NSFW Video</span>
              <span className="sm:hidden">Video</span>
            </TabsTrigger>
            <TabsTrigger value="upscale" className="gap-2" data-testid="tab-upscale">
              <ArrowUpCircle className="h-4 w-4" />
              <span>Upscale</span>
            </TabsTrigger>
            <TabsTrigger value="influencer" className="gap-2" data-testid="tab-influencer">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">AI Influencer</span>
              <span className="sm:hidden">Influencer</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="image" className="space-y-6">
            <div className="space-y-2">
              <Label>Upload Reference Image (Required)</Label>
              <p className="text-sm text-muted-foreground">NSFW image generation uses advanced img2img technology. Upload a reference image and describe the transformation you want.</p>
              <div className="relative">
                {uploadedFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-card">
                      <div className="flex-1 flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        <span className="text-sm truncate">{uploadedFile.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setUploadedFile(null)}
                        data-testid="button-remove-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                      <img
                        src={URL.createObjectURL(uploadedFile)}
                        alt="Reference preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-primary/30 rounded-lg hover-elevate cursor-pointer bg-primary/5">
                    <Image className="h-12 w-12 text-primary mb-2" />
                    <span className="text-base font-semibold text-foreground mb-1">Upload Image to Transform</span>
                    <span className="text-sm text-muted-foreground">Required for NSFW img2img generation</span>
                    <span className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      data-testid="input-file"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt-image">Transformation Prompt</Label>
              <Textarea
                id="prompt-image"
                placeholder="Describe the NSFW transformation you want..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-32 resize-none"
                data-testid="input-prompt"
              />
              <p className="text-xs text-muted-foreground italic">
                ex. nude, beach setting, natural lighting, photorealistic
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !uploadedFile}
              className="w-full h-12 bg-gradient-to-r from-primary to-pink-600 text-base font-semibold"
              data-testid="button-generate"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                'Transform Image (-1 credit)'
              )}
            </Button>

            {generatedContent && (
              <Card className="animate-fade-in overflow-hidden">
                <CardContent className="p-0">
                  <img
                    src={generatedContent}
                    alt="Generated content"
                    className="w-full h-auto rounded-lg"
                    data-testid="img-preview"
                  />
                  <div className="p-4">
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      className="w-full gap-2 border-primary/30"
                      data-testid="button-download"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="video" className="space-y-6">
            <div className="space-y-2">
              <Label>Upload Reference Image (Required)</Label>
              <p className="text-sm text-muted-foreground">Video generation transforms your image into motion. Upload an image and describe the movement you want.</p>
              <div className="relative">
                {uploadedFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-card">
                      <div className="flex-1 flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        <span className="text-sm truncate">{uploadedFile.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setUploadedFile(null)}
                        data-testid="button-remove-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                      <img
                        src={URL.createObjectURL(uploadedFile)}
                        alt="Video reference"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-border rounded-lg hover-elevate cursor-pointer">
                    <Video className="h-12 w-12 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground mb-1">Upload image to animate</span>
                    <span className="text-xs text-muted-foreground">JPG, PNG - required for video generation</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      data-testid="input-file"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt-video">Motion Prompt</Label>
              <Textarea
                id="prompt-video"
                placeholder="Describe the motion and effects you want..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-32 resize-none"
                data-testid="input-prompt"
              />
              <p className="text-xs text-muted-foreground italic">
                ex. Make her dance in a party
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !uploadedFile}
              className="w-full h-12 bg-gradient-to-r from-primary to-pink-600 text-base font-semibold"
              data-testid="button-generate"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                  Generating Video...
                </>
              ) : (
                !uploadedFile ? 'Upload Image First' : 'Generate Video (-5 credits)'
              )}
            </Button>

            {generatedContent && (
              <Card className="animate-fade-in overflow-hidden">
                <CardContent className="p-0">
                  <video
                    src={generatedContent}
                    controls
                    className="w-full h-auto rounded-lg"
                    data-testid="video-preview"
                  />
                  <div className="p-4">
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      className="w-full gap-2 border-primary/30"
                      data-testid="button-download"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="upscale" className="space-y-6">
            <div className="space-y-2">
              <Label>Upload Image to Upscale</Label>
              <div className="relative">
                {uploadedFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-card">
                      <div className="flex-1 flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        <span className="text-sm truncate">{uploadedFile.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setUploadedFile(null)}
                        data-testid="button-remove-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                      <img
                        src={URL.createObjectURL(uploadedFile)}
                        alt="Upload preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-border rounded-lg hover-elevate cursor-pointer">
                    <ArrowUpCircle className="h-12 w-12 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground mb-1">Drag & drop or click to upload</span>
                    <span className="text-xs text-muted-foreground">Support: JPG, PNG</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      data-testid="input-file"
                    />
                  </label>
                )}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full h-12 bg-gradient-to-r from-primary to-pink-600 text-base font-semibold"
              data-testid="button-generate"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                  Upscaling...
                </>
              ) : (
                `Upscale Image (-2 credits)`
              )}
            </Button>

            {generatedContent && (
              <Card className="animate-fade-in">
                <CardContent className="p-4 space-y-4">
                  <img
                    src={generatedContent}
                    alt="Upscaled content"
                    className="w-full h-auto rounded-lg"
                    data-testid="img-preview"
                  />
                  <Button
                    onClick={handleDownload}
                    variant="outline"
                    className="w-full gap-2 border-primary/30"
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4" />
                    Download Upscaled Image
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="influencer" className="space-y-6">
            <Card className="border-2 border-dashed border-border">
              <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-2xl font-semibold mb-2">AI Influencer Creation Coming Soon</h3>
                <p className="text-muted-foreground max-w-md">
                  We're developing a powerful AI influencer creation system. Create and customize your own AI personality with consistent appearance across all content. Stay tuned!
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <LowCreditsModal open={showLowCreditsModal} onClose={() => setShowLowCreditsModal(false)} />
      <GenerationErrorModal open={showGenerationErrorModal} onClose={() => setShowGenerationErrorModal(false)} />
    </div>
  );
}
