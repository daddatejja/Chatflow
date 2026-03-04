import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Plus } from 'lucide-react';

interface CreatePollDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: { question: string; options: string[]; isMultiple: boolean; isAnonymous: boolean }) => void;
}

export function CreatePollDialog({ open, onOpenChange, onSubmit }: CreatePollDialogProps) {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [isMultiple, setIsMultiple] = useState(false);
    const [isAnonymous, setIsAnonymous] = useState(false);

    const handleAddOption = () => {
        if (options.length < 10) {
            setOptions([...options, '']);
        }
    };

    const handleRemoveOption = (index: number) => {
        if (options.length > 2) {
            const newOptions = [...options];
            newOptions.splice(index, 1);
            setOptions(newOptions);
        }
    };

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const validOptions = options.filter(opt => opt.trim() !== '');
        if (question.trim() && validOptions.length >= 2) {
            onSubmit({
                question: question.trim(),
                options: validOptions,
                isMultiple,
                isAnonymous
            });
            // Reset form
            setQuestion('');
            setOptions(['', '']);
            setIsMultiple(false);
            setIsAnonymous(false);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create a Poll</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="question">Question</Label>
                        <Input
                            id="question"
                            placeholder="Ask a question..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-3">
                        <Label>Options</Label>
                        {options.map((option, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    placeholder={`Option ${index + 1}`}
                                    value={option}
                                    onChange={(e) => handleOptionChange(index, e.target.value)}
                                    required={index < 2} // First two are required
                                />
                                {options.length > 2 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveOption(index)}
                                        className="shrink-0"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                        {options.length < 10 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full mt-2"
                                onClick={handleAddOption}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Option
                            </Button>
                        )}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="isMultiple" className="cursor-pointer">Allow multiple answers</Label>
                            <Switch
                                id="isMultiple"
                                checked={isMultiple}
                                onCheckedChange={setIsMultiple}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="isAnonymous" className="cursor-pointer">Anonymous voting</Label>
                            <Switch
                                id="isAnonymous"
                                checked={isAnonymous}
                                onCheckedChange={setIsAnonymous}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button
                            type="submit"
                            disabled={!question.trim() || options.filter(o => o.trim() !== '').length < 2}
                        >
                            Create Poll
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
