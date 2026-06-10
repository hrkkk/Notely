import type { LanguageDefinition } from "../types";

const builtInLanguages: LanguageDefinition[] = [
  {
    name: "Plain Text",
    extensions: ["txt", "log"],
    keywords: [],
    comment: {}
  },
  {
    name: "JavaScript",
    extensions: ["js", "jsx", "mjs", "cjs"],
    keywords: "await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async true false null undefined".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "TypeScript",
    extensions: ["ts", "tsx"],
    keywords: "abstract any as asserts async await boolean break case catch class const constructor continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly require return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Python",
    extensions: ["py", "pyw"],
    keywords: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self".split(" "),
    comment: { line: "#", blockStart: '"""', blockEnd: '"""' },
    stringDelimiters: ["'", '"']
  },
  {
    name: "Java",
    extensions: ["java"],
    keywords: "abstract assert boolean break byte case catch char class const continue default do double else enum exports extends final finally float for goto if implements import instanceof int interface long module native new null package private protected public requires return short static strictfp super switch synchronized this throw throws transient true try var void volatile while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "C",
    extensions: ["c"],
    keywords: "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "C++",
    extensions: ["cpp", "cc", "cxx", "hpp", "hxx", "h"],
    keywords: "alignas alignof and asm auto bool break case catch char class const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "C#",
    extensions: ["cs"],
    keywords: "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var async await".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Rust",
    extensions: ["rs"],
    keywords: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Go",
    extensions: ["go"],
    keywords: "break case chan const continue default defer else fallthrough for func go goto if import interface map nil package range return select struct switch type var true false iota".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Shell",
    extensions: ["sh", "bash", "zsh", "ps1"],
    keywords: "if then else elif fi for while until do done case esac function in select break continue return export local readonly true false".split(" "),
    comment: { line: "#" },
    stringDelimiters: ["'", '"', "`"]
  },
  {
    name: "SQL",
    extensions: ["sql"],
    keywords: "select from where insert update delete create alter drop table view index into values set join left right inner outer full on group by order having limit offset union all distinct as and or not null is like in exists between case when then else end primary key foreign references constraint".split(" "),
    comment: { line: "--", blockStart: "/*", blockEnd: "*/" },
    stringDelimiters: ["'"]
  },
  {
    name: "HTML",
    extensions: ["html", "htm", "xml", "svg"],
    keywords: [],
    comment: { blockStart: "<!--", blockEnd: "-->" },
    type: "markup"
  },
  {
    name: "CSS",
    extensions: ["css", "scss", "less"],
    keywords: "absolute relative fixed sticky static block inline inline-block flex grid none auto inherit initial unset important media supports keyframes from to root hover focus active visited before after".split(" "),
    comment: { blockStart: "/*", blockEnd: "*/" },
    type: "css"
  },
  {
    name: "JSON",
    extensions: ["json"],
    keywords: "true false null".split(" "),
    comment: {},
    type: "json"
  },
  {
    name: "YAML",
    extensions: ["yaml", "yml"],
    keywords: "true false null yes no on off".split(" "),
    comment: { line: "#" }
  },
  {
    name: "Markdown",
    extensions: ["md", "markdown"],
    keywords: [],
    comment: { blockStart: "<!--", blockEnd: "-->" },
    type: "markdown"
  },
  {
    name: "Ruby",
    extensions: ["rb"],
    keywords: "BEGIN END alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield".split(" "),
    comment: { line: "#" }
  },
  {
    name: "PHP",
    extensions: ["php"],
    keywords: "abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list namespace new null or print private protected public require require_once return static switch throw trait try unset use var while xor yield true false".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Lua",
    extensions: ["lua"],
    keywords: "and break do else elseif end false for function goto if in local nil not or repeat return then true until while".split(" "),
    comment: { line: "--", blockStart: "--[[", blockEnd: "]]" }
  },
  {
    name: "Kotlin",
    extensions: ["kt", "kts"],
    keywords: "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set setparam where actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinit noinline open operator out override private protected public reified sealed suspend tailrec vararg".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  }
];

export { builtInLanguages };
